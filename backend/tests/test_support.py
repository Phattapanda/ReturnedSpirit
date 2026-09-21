"""Tests for POST /api/support (Emergent managed email relay).

Rate limit: 10 req/hour per process on the backend. We send at most 8 requests
here (all counted, including validation-failed ones, because the endpoint
increments the counter before parsing the body).
"""
import os

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
SUPPORT_URL = f"{BASE_URL}/api/support"


@pytest.fixture(scope="module")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


# --- Happy paths ------------------------------------------------------------

class TestSupportSuccess:
    def test_message_only_accepted(self, api_client):
        r = api_client.post(SUPPORT_URL, json={"message": "TEST_ hello from pytest (message only)"})
        if r.status_code == 429:
            pytest.skip("Rate limited (429) - process quota exhausted")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body == {"accepted": True}

    def test_message_with_valid_reply_email(self, api_client):
        r = api_client.post(
            SUPPORT_URL,
            json={
                "message": "TEST_ hello with reply email",
                "reply_email": "delivered@resend.dev",
            },
        )
        if r.status_code == 429:
            pytest.skip("Rate limited (429) - process quota exhausted")
        assert r.status_code == 200, r.text
        assert r.json() == {"accepted": True}


# --- Validation failures ----------------------------------------------------

class TestSupportValidation:
    def test_empty_message_rejected(self, api_client):
        r = api_client.post(SUPPORT_URL, json={"message": ""})
        if r.status_code == 429:
            pytest.skip("Rate limited")
        assert r.status_code == 400, r.text

    def test_missing_message_rejected(self, api_client):
        r = api_client.post(SUPPORT_URL, json={"reply_email": "delivered@resend.dev"})
        if r.status_code == 429:
            pytest.skip("Rate limited")
        assert r.status_code == 400, r.text

    def test_invalid_reply_email_rejected(self, api_client):
        r = api_client.post(
            SUPPORT_URL, json={"message": "TEST_ bad email", "reply_email": "not-an-email"}
        )
        if r.status_code == 429:
            pytest.skip("Rate limited")
        assert r.status_code == 400, r.text

    def test_extra_field_rejected(self, api_client):
        r = api_client.post(
            SUPPORT_URL,
            json={"message": "TEST_ extra field", "unexpected_field": "boom"},
        )
        if r.status_code == 429:
            pytest.skip("Rate limited")
        assert r.status_code == 400, r.text

    def test_whitespace_only_message_rejected(self, api_client):
        # str_strip_whitespace=True in model config; " " should collapse to "" -> min_length=1 fails
        r = api_client.post(SUPPORT_URL, json={"message": "   "})
        if r.status_code == 429:
            pytest.skip("Rate limited")
        assert r.status_code == 400, r.text
