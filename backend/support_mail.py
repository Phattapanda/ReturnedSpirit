"""Support mail relay via Emergent's managed email service.

A player submits a message, a category, and an optional reply address, plus an
optional screenshot. The support request is emailed to a fixed owner address
(chosen server-side, never by the caller — this is not an open relay). When a
reply address is supplied, an automatic confirmation is sent back to the player.

Screenshots are re-encoded (stripping EXIF/GPS), uploaded to Emergent Object
Storage, and embedded in the owner email as an <img> served by a public,
token-guarded backend route (email clients fetch images without auth headers).
"""
import base64
import binascii
import io
import ipaddress
import json
import logging
import os
import re
import time
import uuid
from collections import deque
from datetime import datetime, timezone
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

import httpx
import requests
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorClient
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict, EmailStr, Field, ValidationError
from starlette.concurrency import run_in_threadpool
from starlette.responses import Response

load_dotenv(Path(__file__).parent / ".env")
logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

# Emergent managed email proxy. A constant on purpose so it survives deployment.
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ["EMERGENT_EMAIL_KEY"]
EMAIL_FROM_NAME = os.environ["EMAIL_FROM_NAME"]
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")

# Emergent Object Storage (screenshots).
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "returned-spirit"
_storage_key = None

# Recipient is fixed server-side; the client can never choose it.
SUPPORT_ADDRESS = "arcades.soijanda@gmail.com"
MAX_IMAGE_BYTES = 3 * 1024 * 1024
MAX_BODY_BYTES = 4 * 1024 * 1024 + 65536
Image.MAX_IMAGE_PIXELS = 12_000_000
attempts = deque()

_mongo = AsyncIOMotorClient(os.environ["MONGO_URL"])
_db = _mongo[os.environ["DB_NAME"]]

_CATEGORY_LABELS = {"bug": "Bug", "idea": "Idea", "other": "Other"}


class SupportMessage(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    message: str = Field(min_length=1, max_length=5000)
    category: Literal["bug", "idea", "other"] = "other"
    reply_email: EmailStr | None = None
    screenshot: str | None = Field(default=None, max_length=4 * 1024 * 1024)


# ---------------------------------------------------------------------------
# Object storage helpers (sync `requests`; call via run_in_threadpool).
# ---------------------------------------------------------------------------
def _init_storage() -> str:
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def _put_object(path: str, data: bytes, content_type: str) -> dict:
    global _storage_key
    key = _init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    if resp.status_code == 503:  # stale key: reset and retry once
        _storage_key = None
        key = _init_storage()
        resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def _get_object(path: str) -> tuple[bytes, str]:
    global _storage_key
    key = _init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 503:
        _storage_key = None
        key = _init_storage()
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


def clean_screenshot(encoded: str) -> bytes:
    """Validate and re-encode to JPEG pixel data only (drops EXIF/GPS/filename)."""
    try:
        raw = base64.b64decode(encoded, validate=True)
        if not raw or len(raw) > MAX_IMAGE_BYTES:
            raise ValueError()
        with Image.open(io.BytesIO(raw)) as source:
            if source.format not in ("PNG", "JPEG", "WEBP") or source.width * source.height > 12_000_000:
                raise ValueError()
            source.load()
            pixels = source.convert("RGB")
            clean = Image.new("RGB", pixels.size)
            clean.paste(pixels)
            result = io.BytesIO()
            clean.save(result, format="JPEG", quality=85)
            content = result.getvalue()
            if len(content) > MAX_IMAGE_BYTES:
                raise ValueError()
            return content
    except (ValueError, OSError, binascii.Error, UnidentifiedImageError, Image.DecompressionBombError):
        raise HTTPException(400, "Choose a PNG, JPEG or WebP screenshot under 3 MB and 12 megapixels.") from None


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


def _support_html(message: str, category: str, reply_email: str | None, image_url: str | None) -> str:
    contact = escape(reply_email) if reply_email else "No contact address supplied."
    safe_message = escape(message).replace("\n", "<br>")
    if image_url:
        shot = (
            '<p style="margin:16px 0 8px"><strong>Screenshot:</strong></p>'
            f'<img src="{image_url}" alt="Player screenshot" '
            'style="max-width:100%;border:1px solid #eee;border-radius:8px">'
            f'<p style="font-size:12px;color:#888"><a href="{image_url}">Open screenshot</a></p>'
        )
    else:
        shot = ""
    return (
        '<table role="presentation" width="100%"><tr><td style="padding:24px;'
        'font-family:Arial,sans-serif;color:#2C1810">'
        '<h2 style="margin:0 0 12px">A Returned Spirit - Support request</h2>'
        f'<p style="margin:0 0 4px"><strong>Category:</strong> {escape(_CATEGORY_LABELS[category])}</p>'
        f'<p style="margin:0 0 4px"><strong>Reply address:</strong> {contact}</p>'
        '<hr style="border:none;border-top:1px solid #eee;margin:16px 0">'
        f'<p style="white-space:pre-wrap">{safe_message}</p>'
        f'{shot}'
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


def _public_base(request: Request) -> str:
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
    return f"https://{host}"


async def _store_screenshot(encoded: str, request: Request) -> str | None:
    """Clean, upload and register a screenshot. Returns a public image URL or None."""
    try:
        content = clean_screenshot(encoded)
        token = uuid.uuid4().hex
        storage_path = f"{APP_NAME}/support/{token}.jpg"
        await run_in_threadpool(_put_object, storage_path, content, "image/jpeg")
        await _db.support_screenshots.insert_one({
            "token": token,
            "storage_path": storage_path,
            "content_type": "image/jpeg",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return f"{_public_base(request)}/api/support/screenshot/{token}"
    except HTTPException:
        raise
    except Exception as e:
        # Never fail the whole support request because storage was unavailable.
        logger.error(f"Screenshot upload failed: {e}")
        return None


@router.get("/support/screenshot/{token}")
async def support_screenshot(token: str):
    """Public, token-guarded image route so email clients can render the screenshot."""
    if not re.fullmatch(r"[0-9a-f]{32}", token):
        raise HTTPException(404, "Not found")
    doc = await _db.support_screenshots.find_one({"token": token}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    try:
        data, ctype = await run_in_threadpool(_get_object, doc["storage_path"])
    except Exception:
        raise HTTPException(404, "Not found") from None
    return Response(content=data, media_type=ctype, headers={"Cache-Control": "public, max-age=31536000"})


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

    image_url = await _store_screenshot(payload.screenshot, request) if payload.screenshot else None

    # Support request to the fixed owner address (recipient never caller-controlled).
    await send_email(
        to=SUPPORT_ADDRESS,
        subject=f"A Returned Spirit - Support ({_CATEGORY_LABELS[payload.category]})",
        html=_support_html(
            payload.message,
            payload.category,
            str(payload.reply_email) if payload.reply_email else None,
            image_url,
        ),
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
