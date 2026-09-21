"""Support mail relay via Emergent's managed email service.

A player submits a message and an optional reply address. The support request is
emailed to a fixed owner address (chosen server-side, never by the caller — this
is not an open relay). When a reply address is supplied, an automatic
confirmation is sent back to the player using a fixed template.
"""
import ipaddress
import json
import logging
import os
import re
import time
from collections import deque
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, EmailStr, Field, ValidationError

load_dotenv(Path(__file__).parent / ".env")
logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

# Emergent managed email proxy. A constant on purpose so it survives deployment.
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ["EMERGENT_EMAIL_KEY"]
EMAIL_FROM_NAME = os.environ["EMAIL_FROM_NAME"]
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")

# Recipient is fixed server-side; the client can never choose it.
SUPPORT_ADDRESS = "arcades.soijanda@gmail.com"
MAX_BODY_BYTES = 4 * 1024 * 1024 + 65536
attempts = deque()


class SupportMessage(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    message: str = Field(min_length=1, max_length=5000)
    reply_email: EmailStr | None = None
    # Accepted for backward compatibility with the app. Screenshots cannot be
    # attached through the managed email service, so the value is not forwarded.
    screenshot: str | None = Field(default=None, max_length=4 * 1024 * 1024)


# ---------------------------------------------------------------------------
# Guardrail gate (from the Emergent email playbook; call on every send).
# ---------------------------------------------------------------------------
_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str, reply_to: str | None = None) -> str | None:
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if reply_to or EMAIL_REPLY_TO:
        payload["contact_email"] = reply_to or EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json=payload,
            )
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        logger.error(f"Email send failed: {e.response.status_code} {e.response.text}")
        raise HTTPException(status_code=502, detail="Failed to send email")
    except Exception as e:
        logger.error(f"Email send error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to send email")


def _support_html(message: str, reply_email: str | None, has_screenshot: bool) -> str:
    contact = escape(reply_email) if reply_email else "No contact address supplied."
    note = ('<p style="font-size:13px;color:#555">The player attached a screenshot in the app. '
            'Screenshots are not forwarded by the email service.</p>' if has_screenshot else "")
    safe_message = escape(message).replace("\n", "<br>")
    return (
        '<table role="presentation" width="100%"><tr><td style="padding:24px;'
        'font-family:Arial,sans-serif;color:#2C1810">'
        '<h2 style="margin:0 0 12px">A Returned Spirit - Support request</h2>'
        f'<p style="margin:0 0 4px"><strong>Reply address:</strong> {contact}</p>'
        '<hr style="border:none;border-top:1px solid #eee;margin:16px 0">'
        f'<p style="white-space:pre-wrap">{safe_message}</p>'
        f'{note}'
        '<p style="font-size:12px;color:#888;margin-top:24px">Sent by A Returned Spirit. '
        'We never ask for your password or card details by email.</p>'
        '</td></tr></table>'
    )


def _confirmation_html() -> str:
    return (
        '<table role="presentation" width="100%"><tr><td style="padding:24px;'
        'font-family:Arial,sans-serif;color:#2C1810">'
        '<h2 style="margin:0 0 12px">Thanks for reaching out!</h2>'
        '<p>We have received your support request for <strong>A Returned Spirit</strong> '
        'and will get back to you as soon as we can.</p>'
        '<p>You do not need to do anything else - this is simply a confirmation that '
        'your message arrived.</p>'
        '<p style="font-size:12px;color:#888;margin-top:24px">Sent by A Returned Spirit. '
        'We never ask for your password or card details by email.</p>'
        '</td></tr></table>'
    )


@router.post("/support")
async def submit_support(request: Request):
    # Conservative process-wide quota (stores timestamps only, no IP addresses).
    now = time.monotonic()
    while attempts and attempts[0] < now - 3600:
        attempts.popleft()
    if len(attempts) >= 10:
        raise HTTPException(429, "Support is receiving too many requests. Please try again later.")

    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > MAX_BODY_BYTES:
            raise HTTPException(413, "The screenshot is too large (maximum 3 MB).")
    try:
        payload = SupportMessage.model_validate(json.loads(raw))
    except (ValueError, ValidationError):
        raise HTTPException(400, "Check your message, optional email address and screenshot.") from None

    # Count only valid requests against the quota so malformed ones cannot drain it.
    attempts.append(now)

    # Support request to the fixed owner address (recipient never caller-controlled).
    await send_email(
        to=SUPPORT_ADDRESS,
        subject="A Returned Spirit - Support request",
        html=_support_html(payload.message, str(payload.reply_email) if payload.reply_email else None, bool(payload.screenshot)),
    )

    # Optional confirmation to the player. Fixed template with no echoed user
    # content, so it cannot be abused to deliver arbitrary text to any inbox.
    if payload.reply_email:
        try:
            await send_email(
                to=str(payload.reply_email),
                subject="We received your message - A Returned Spirit",
                html=_confirmation_html(),
            )
        except HTTPException:
            logger.warning("Confirmation email could not be sent to the player.")

    return {"accepted": True}
