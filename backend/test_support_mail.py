"""Offline regression tests: SMTP is mocked; no real mail leaves this process."""
import base64
import io
import os
import smtplib
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

import support_mail as support


class SupportTests(unittest.TestCase):
    def setUp(self):
        support.attempts.clear()
        self.environment = patch.dict(os.environ, {"SUPPORT_GMAIL_APP_PASSWORD": "test-only"})
        self.environment.start()
        self.smtp = patch.object(support.smtplib, "SMTP_SSL")
        self.connection = self.smtp.start().return_value.__enter__.return_value
        self.connection.send_message.return_value = {}
        app = FastAPI()
        app.include_router(support.router)
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.smtp.stop()
        self.environment.stop()

    def test_no_contact_address(self):
        response = self.client.post("/api/support", json={"message": "A bucket disappeared"})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["accepted"])
        mail = self.connection.send_message.call_args.args[0]
        self.assertEqual(mail["From"], support.SUPPORT_ADDRESS)
        self.assertEqual(mail["To"], support.SUPPORT_ADDRESS)
        self.assertIsNone(mail["Reply-To"])
        self.assertIn("A bucket disappeared", mail.get_content())

    def test_reply_address_and_sanitized_attachment(self):
        image = Image.new("RGB", (8, 8), "red")
        exif = Image.Exif()
        exif[315] = "Private author"
        source = io.BytesIO()
        image.save(source, format="JPEG", exif=exif)
        response = self.client.post("/api/support", json={
            "message": "Please reply", "reply_email": "player@example.com",
            "screenshot": base64.b64encode(source.getvalue()).decode(),
        })
        self.assertEqual(response.status_code, 200)
        mail = self.connection.send_message.call_args.args[0]
        self.assertEqual(mail["Reply-To"], "player@example.com")
        attachment = next(mail.iter_attachments())
        self.assertEqual(attachment.get_filename(), "screenshot.jpg")
        with Image.open(io.BytesIO(attachment.get_payload(decode=True))) as clean:
            self.assertFalse(clean.getexif())

    def test_invalid_input_never_sends(self):
        for payload in [
            {"message": " "}, {"message": "x" * 5001},
            {"message": "hello", "reply_email": "invalid"},
            {"message": "hello", "reply_email": "x@example.com\r\nBcc: victim@example.com"},
            {"message": "hello", "to": "other@example.com"},
            {"message": "hello", "screenshot": "invalid base64"},
            {"message": "hello", "screenshot": base64.b64encode(b"not an image").decode()},
        ]:
            with self.subTest(payload=payload.keys()):
                self.assertEqual(self.client.post("/api/support", json=payload).status_code, 400)
        self.connection.send_message.assert_not_called()

    def test_missing_configuration(self):
        with patch.dict(os.environ, {"SUPPORT_GMAIL_APP_PASSWORD": ""}):
            self.assertEqual(self.client.post("/api/support", json={"message": "hello"}).status_code, 503)
        self.connection.send_message.assert_not_called()

    def test_smtp_failure_is_not_success(self):
        self.connection.login.side_effect = smtplib.SMTPAuthenticationError(535, b"test")
        self.assertEqual(self.client.post("/api/support", json={"message": "hello"}).status_code, 502)
        self.connection.send_message.assert_not_called()

    def test_rate_limit(self):
        for _ in range(10):
            self.assertEqual(self.client.post("/api/support", json={"message": "hello"}).status_code, 200)
        self.assertEqual(self.client.post("/api/support", json={"message": "hello"}).status_code, 429)
        self.assertEqual(self.connection.send_message.call_count, 10)

    def test_oversize_body(self):
        response = self.client.post("/api/support", content=b"x" * (support.MAX_BODY_BYTES + 1))
        self.assertEqual(response.status_code, 413)
        self.connection.send_message.assert_not_called()


if __name__ == "__main__":
    unittest.main()
