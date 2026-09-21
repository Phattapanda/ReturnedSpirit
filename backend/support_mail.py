"""Support mail relay. No player account or contact address is required."""
import base64
import binascii
import io
import json
import os
import smtplib
import ssl
import time
from collections import deque
from email.message import EmailMessage

from fastapi import APIRouter, HTTPException, Request
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict, EmailStr, Field, ValidationError
from starlette.concurrency import run_in_threadpool

router = APIRouter(prefix="/api")
SUPPORT_ADDRESS = "arcades.soijanda@gmail.com"
MAX_IMAGE_BYTES = 3 * 1024 * 1024
MAX_BODY_BYTES = 4 * 1024 * 1024 + 65536
attempts = deque()
Image.MAX_IMAGE_PIXELS = 12_000_000


class SupportMessage(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    message: str = Field(min_length=1, max_length=5000)
    reply_email: EmailStr | None = None
    screenshot: str | None = Field(default=None, max_length=4 * 1024 * 1024)


def clean_screenshot(encoded: str) -> bytes:
    try:
        raw = base64.b64decode(encoded, validate=True)
        if not raw or len(raw) > MAX_IMAGE_BYTES:
            raise ValueError()
        with Image.open(io.BytesIO(raw)) as source:
            if source.format not in ("PNG", "JPEG", "WEBP") or source.width * source.height > 12_000_000:
                raise ValueError()
            source.load()
            # Re-encode pixel data only: no original filename, EXIF or GPS data.
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


def build_mail(payload: SupportMessage) -> EmailMessage:
    mail = EmailMessage()
    # Client cannot select the sender or recipient; this is not an open relay.
    mail["From"] = SUPPORT_ADDRESS
    mail["To"] = SUPPORT_ADDRESS
    mail["Subject"] = "A Returned Spirit — Support"
    if payload.reply_email:
        mail["Reply-To"] = str(payload.reply_email)
    mail.set_content(
        "Player support message\n"
        + ("Reply requested: " + str(payload.reply_email) if payload.reply_email else "No contact address supplied.")
        + "\n\n" + payload.message
    )
    if payload.screenshot:
        mail.add_attachment(clean_screenshot(payload.screenshot), maintype="image", subtype="jpeg", filename="screenshot.jpg")
    return mail


def send_support_mail(payload: SupportMessage, password: str):
    mail = build_mail(payload)
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=20, context=ssl.create_default_context()) as smtp:
            smtp.login(SUPPORT_ADDRESS, password)
            refused = smtp.send_message(mail)
            if refused:
                raise smtplib.SMTPException("Recipient rejected")
    except (OSError, smtplib.SMTPException):
        # Do not log credentials, message bodies, contact addresses or attachments.
        raise HTTPException(502, "The mail service could not confirm sending. Your draft has been kept.") from None


@router.post("/support")
async def submit_support(request: Request):
    password = os.environ.get("SUPPORT_GMAIL_APP_PASSWORD", "").strip()
    if not password:
        raise HTTPException(503, "Support sending is not configured yet. Please try again later.")
    # Conservative process-wide quota: stores timestamps only, no IP addresses.
    # Add an ingress limit for multi-worker/public deployments (see SUPPORT_SETUP.md).
    now = time.monotonic()
    while attempts and attempts[0] < now - 3600:
        attempts.popleft()
    if len(attempts) >= 10:
        raise HTTPException(429, "Support is receiving too many requests. Please try again later.")
    attempts.append(now)
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > MAX_BODY_BYTES:
            raise HTTPException(413, "The screenshot is too large (maximum 3 MB).")
    try:
        payload = SupportMessage.model_validate(json.loads(raw))
    except (ValueError, ValidationError):
        raise HTTPException(400, "Check your message, optional email address and screenshot.") from None
    await run_in_threadpool(send_support_mail, payload, password)
    return {"accepted": True}
