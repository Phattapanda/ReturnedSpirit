"""Tests for POST /api/support and GET /api/support/screenshot/{token}.

Covers the two NEW features:
  1. Category selector (bug / idea / other) - Literal-validated on the server.
  2. Screenshot forwarding - Pillow re-encode, Object Storage upload,
     public token-guarded image route embedded via <img> in the owner email.

Rate limit: 10 VALID requests / hour / process. Only successful validation
increments the counter (support_mail.py already fixed this after iter 41),
so 400s do NOT drain quota. We fire ~5 successful sends here.
"""
import base64
import io
import os

import pymongo
import pytest
import requests
from PIL import Image

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
SUPPORT_URL = f"{BASE_URL}/api/support"
SCREENSHOT_URL = f"{BASE_URL}/api/support/screenshot"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


def _tiny_png_b64() -> str:
    """Return a small valid 320x200 red PNG as base64 (well under all limits)."""
    img = Image.new("RGB", (320, 200), color=(200, 40, 40))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def mongo():
    client = pymongo.MongoClient(MONGO_URL, serverSelectionTimeoutMS=3000)
    yield client[DB_NAME]
    client.close()


# --- Feature 1: Category selector -------------------------------------------

class TestSupportCategory:
    def test_category_bug_no_reply_email(self, api_client):
        r = api_client.post(SUPPORT_URL, json={
            "message": "TEST_ bug report", "category": "bug",
        })
        if r.status_code == 429:
            pytest.skip("Rate limited")
        assert r.status_code == 200, r.text
        assert r.json() == {"accepted": True}

    def test_category_idea_with_reply_email(self, api_client):
        r = api_client.post(SUPPORT_URL, json={
            "message": "TEST_ idea submission",
            "category": "idea",
            "reply_email": "delivered@resend.dev",
        })
        if r.status_code == 429:
            pytest.skip("Rate limited")
        assert r.status_code == 200, r.text
        assert r.json() == {"accepted": True}

    def test_category_other_default(self, api_client):
        # 'other' is default when category is omitted
        r = api_client.post(SUPPORT_URL, json={"message": "TEST_ default category"})
        if r.status_code == 429:
            pytest.skip("Rate limited")
        assert r.status_code == 200, r.text

    def test_invalid_category_rejected(self, api_client):
        r = api_client.post(SUPPORT_URL, json={
            "message": "TEST_ bad category", "category": "spam",
        })
        if r.status_code == 429:
            pytest.skip("Rate limited")
        assert r.status_code == 400, r.text


# --- Feature 2: Screenshot forwarding ---------------------------------------

class TestSupportScreenshot:
    def test_screenshot_accepted_and_persisted(self, api_client, mongo):
        before = mongo.support_screenshots.count_documents({})
        r = api_client.post(SUPPORT_URL, json={
            "message": "TEST_ with screenshot",
            "category": "bug",
            "screenshot": _tiny_png_b64(),
        })
        if r.status_code == 429:
            pytest.skip("Rate limited")
        assert r.status_code == 200, r.text
        assert r.json() == {"accepted": True}

        after = mongo.support_screenshots.count_documents({})
        assert after == before + 1, "support_screenshots doc was not created"

        # Verify the newest doc has the expected shape and a hex token
        doc = mongo.support_screenshots.find_one(sort=[("created_at", -1)])
        assert doc is not None
        assert set(["token", "storage_path", "content_type", "created_at"]).issubset(doc.keys())
        assert doc["content_type"] == "image/jpeg"
        assert len(doc["token"]) == 32 and all(c in "0123456789abcdef" for c in doc["token"])
        # stash for the next test
        pytest.support_token = doc["token"]

    def test_get_screenshot_returns_jpeg(self, api_client, mongo):
        token = getattr(pytest, "support_token", None)
        if not token:
            doc = mongo.support_screenshots.find_one(sort=[("created_at", -1)])
            token = doc and doc.get("token")
        if not token:
            pytest.skip("No screenshot token available")
        r = api_client.get(f"{SCREENSHOT_URL}/{token}")
        assert r.status_code == 200, r.text
        assert r.headers.get("Content-Type", "").startswith("image/jpeg")
        # Real image bytes (JPEG magic FF D8 FF)
        assert r.content[:3] == b"\xff\xd8\xff"

    def test_get_screenshot_non_hex_returns_404(self, api_client):
        r = api_client.get(f"{SCREENSHOT_URL}/not-a-hex-token")
        assert r.status_code == 404, r.text

    def test_get_screenshot_unknown_hex_returns_404(self, api_client):
        # syntactically valid 32-char hex but no such document
        r = api_client.get(f"{SCREENSHOT_URL}/{'0' * 32}")
        assert r.status_code == 404, r.text


# --- Validation (regression from iter 41) -----------------------------------

class TestSupportValidation:
    def test_empty_message_rejected(self, api_client):
        r = api_client.post(SUPPORT_URL, json={"message": ""})
        assert r.status_code == 400, r.text

    def test_missing_message_rejected(self, api_client):
        r = api_client.post(SUPPORT_URL, json={"reply_email": "delivered@resend.dev"})
        assert r.status_code == 400, r.text

    def test_invalid_reply_email_rejected(self, api_client):
        r = api_client.post(SUPPORT_URL, json={
            "message": "TEST_ bad email", "reply_email": "not-an-email",
        })
        assert r.status_code == 400, r.text
