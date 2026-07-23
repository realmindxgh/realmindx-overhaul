import hashlib
import hmac
import json
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from sqlalchemy.exc import IntegrityError

SITE_ROOT = Path(__file__).resolve().parents[1]
if str(SITE_ROOT) not in sys.path:
    sys.path.insert(0, str(SITE_ROOT))

from backend import create_app
from backend.config import Config
from backend.extensions import db
from backend.models import ContactChangeToken, Role, User, WhatsAppWebhookEvent
from backend.profile_completion import teacher_profile_completion
from backend.whatsapp_service import WHATSAPP_VERIFICATION_PHRASE, send_whatsapp_otp


class ContactVerificationTestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    SECRET_KEY = "contact-verification-tests"
    CORS_ORIGINS = ["http://localhost"]
    RATELIMIT_ENABLED = False
    WHATSAPP_ACCESS_TOKEN = "test-token"
    WHATSAPP_PHONE_NUMBER_ID = "123456789"
    WHATSAPP_OTP_TEMPLATE_NAME = "realmindx_verification_code"
    WHATSAPP_OTP_TEMPLATE_LANGUAGE = "en_US"
    WHATSAPP_GRAPH_API_VERSION = "v23.0"
    WHATSAPP_APP_SECRET = ""
    WHATSAPP_PHONE_VERIFICATION_ENABLED = True
    WHATSAPP_PHONE_VERIFICATION_ALLOW_ALL = True
    WHATSAPP_PHONE_VERIFICATION_TEST_EMAILS = "contact@example.com"
    FACEBOOK_APP_SECRET = ""


class ContactVerificationTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(ContactVerificationTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()

        role = Role(name="user", description="Teacher/customer")
        user = User(
            email="contact@example.com",
            first_name="Test",
            last_name="User",
            role=role,
            is_active=True,
            is_verified=True,
        )
        user.set_password("Password123!")
        db.session.add_all([role, user])
        db.session.commit()
        self.client = self.app.test_client()
        response = self.client.post(
            "/api/auth/login",
            json={"email": user.email, "password": "Password123!"},
        )
        self.assertEqual(response.status_code, 200)

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.context.pop()

    def test_request_phone_code_by_whatsapp_creates_inbound_challenge(self):
        response = self.client.post(
            "/api/me/contact-change/request",
            json={"field": "phone", "value": "024 000 0000", "channel": "whatsapp"},
        )

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["channel"], "whatsapp")
        self.assertEqual(data["delivery_channel"], "whatsapp_inbound")
        self.assertEqual(data["verification_mode"], "whatsapp_inbound")
        self.assertEqual(data["whatsapp_number"], "+233257125229")
        self.assertEqual(data["challenge_phrase"], WHATSAPP_VERIFICATION_PHRASE)
        self.assertNotIn("challenge_code", data)
        self.assertIn("wa.me/233257125229", data["whatsapp_url"])
        self.assertIn("Verify%20my%20RealMindX%20number", data["whatsapp_url"])
        self.assertFalse(data["manual_entry_allowed"])
        self.assertEqual(data["next_request_in_seconds"], 45)
        self.assertIn("prefilled verification message", data["message"])

    def test_whatsapp_phone_verification_can_be_disabled(self):
        self.app.config["WHATSAPP_PHONE_VERIFICATION_ENABLED"] = False

        response = self.client.post(
            "/api/me/contact-change/request",
            json={"field": "phone", "value": "024 000 0000", "channel": "whatsapp"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("temporarily unavailable", response.get_json()["error"])

    def test_whatsapp_phone_verification_is_available_to_all_enabled_users(self):
        self.app.config["WHATSAPP_PHONE_VERIFICATION_TEST_EMAILS"] = "someone-else@example.com"

        response = self.client.post(
            "/api/me/contact-change/request",
            json={"field": "phone", "value": "024 000 0000", "channel": "whatsapp"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["delivery_channel"], "whatsapp_inbound")

    def test_whatsapp_inbound_challenge_cannot_be_typed_into_site(self):
        challenge = self.client.post(
            "/api/me/contact-change/request",
            json={"field": "phone", "value": "024 000 0000", "channel": "whatsapp"},
        ).get_json()

        response = self.client.post(
            "/api/me/contact-change/verify",
            json={"challenge_id": challenge["challenge_id"], "otp": "123456"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("WhatsApp challenge", response.get_json()["error"])

    @patch("backend.api.whatsapp.send_whatsapp_text", return_value=True)
    def test_whatsapp_webhook_verifies_matching_sender(self, reply_mock):
        challenge = self.client.post(
            "/api/me/contact-change/request",
            json={"field": "phone", "value": "024 000 0000", "channel": "whatsapp"},
        ).get_json()
        payload = {
            "entry": [{
                "changes": [{
                    "value": {
                        "metadata": {"phone_number_id": "123456789"},
                        "messages": [{
                            "id": "wamid.correct",
                            "from": "233240000000",
                            "type": "text",
                            "text": {"body": WHATSAPP_VERIFICATION_PHRASE},
                        }],
                    },
                }],
            }],
        }

        webhook = self.client.post("/api/webhooks/whatsapp", json=payload)
        self.assertEqual(webhook.status_code, 200)
        self.assertEqual(webhook.get_json()["results"][0]["status"], "verified")
        self.assertEqual(webhook.get_json()["results"][0]["reply_status"], "sent")
        reply_mock.assert_called_once()
        self.assertIn("WhatsApp number verified successfully", reply_mock.call_args.args[1])
        self.assertIn("The number you entered on RealMindX has now been verified.", reply_mock.call_args.args[1])
        self.assertIn("+233 20 116 6122", reply_mock.call_args.args[1])
        event = WhatsAppWebhookEvent.query.filter_by(message_id="wamid.correct").one()
        self.assertEqual(event.status, "verified")
        self.assertEqual(event.phone_number_id, "123456789")
        status = self.client.get(f"/api/me/contact-change/{challenge['challenge_id']}/status")
        self.assertTrue(status.get_json()["verified"])
        db.session.expire_all()
        user = User.query.filter_by(email="contact@example.com").one()
        challenge_row = db.session.get(ContactChangeToken, challenge["challenge_id"])
        self.assertEqual(user.phone, "+233240000000")
        self.assertTrue(user.phone_verified)
        self.assertIsNotNone(user.phone_verified_at)
        self.assertEqual(challenge_row.status, "verified")
        self.assertIsNotNone(challenge_row.verified_at)
        self.assertIsNone(challenge_row.active_lock_key)

    @patch("backend.api.whatsapp.send_whatsapp_text", return_value=True)
    def test_whatsapp_webhook_accepts_valid_meta_signature(self, reply_mock):
        self.app.config["WHATSAPP_APP_SECRET"] = "test-meta-secret"
        challenge = self.client.post(
            "/api/me/contact-change/request",
            json={"field": "phone", "value": "024 000 0000", "channel": "whatsapp"},
        ).get_json()
        payload = {
            "entry": [{
                "changes": [{
                    "value": {
                        "metadata": {"phone_number_id": "123456789"},
                        "messages": [{
                            "id": "wamid.signed",
                            "from": "233240000000",
                            "type": "text",
                            "text": {"body": "  verify my realmindx number  "},
                        }],
                    },
                }],
            }],
        }
        raw_body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        signature = hmac.new(
            self.app.config["WHATSAPP_APP_SECRET"].encode("utf-8"),
            raw_body,
            hashlib.sha256,
        ).hexdigest()

        webhook = self.client.post(
            "/api/webhooks/whatsapp",
            data=raw_body,
            content_type="application/json",
            headers={"X-Hub-Signature-256": f"sha256={signature}"},
        )

        self.assertEqual(webhook.status_code, 200)
        self.assertEqual(webhook.get_json()["results"][0]["status"], "verified")
        reply_mock.assert_called_once()

    @patch("backend.api.whatsapp.send_whatsapp_text", return_value=True)
    def test_whatsapp_webhook_rejects_verification_phrase_from_wrong_sender(self, reply_mock):
        challenge = self.client.post(
            "/api/me/contact-change/request",
            json={"field": "phone", "value": "024 000 0000", "channel": "whatsapp"},
        ).get_json()
        payload = {
            "entry": [{
                "changes": [{
                    "value": {
                        "metadata": {"phone_number_id": "123456789"},
                        "messages": [{
                            "id": "wamid.wrong",
                            "from": "233555000111",
                            "type": "text",
                            "text": {"body": WHATSAPP_VERIFICATION_PHRASE},
                        }],
                    },
                }],
            }],
        }

        webhook = self.client.post("/api/webhooks/whatsapp", json=payload)
        self.assertEqual(webhook.status_code, 200)
        self.assertEqual(webhook.get_json()["results"][0]["status"], "verification_no_active_request")
        self.assertEqual(webhook.get_json()["results"][0]["reply_status"], "sent")
        reply_mock.assert_called_once()
        self.assertIn("could not find an active RealMindX verification request", reply_mock.call_args.args[1])
        status = self.client.get(f"/api/me/contact-change/{challenge['challenge_id']}/status")
        status_data = status.get_json()
        self.assertEqual(status_data["status"], "pending")
        self.assertFalse(status_data["wrong_number"])

    @patch("backend.api.whatsapp.send_whatsapp_text", return_value=True)
    def test_whatsapp_webhook_rejects_verification_phrase_without_active_request(self, reply_mock):
        payload = {
            "entry": [{
                "changes": [{
                    "value": {
                        "metadata": {"phone_number_id": "123456789"},
                        "messages": [{
                            "id": "wamid.no-request",
                            "from": "233240000000",
                            "type": "text",
                            "text": {"body": WHATSAPP_VERIFICATION_PHRASE},
                        }],
                    },
                }],
            }],
        }

        webhook = self.client.post("/api/webhooks/whatsapp", json=payload)

        self.assertEqual(webhook.status_code, 200)
        self.assertEqual(webhook.get_json()["results"][0]["status"], "verification_no_active_request")
        self.assertEqual(webhook.get_json()["results"][0]["reply_status"], "sent")
        reply_mock.assert_called_once()
        self.assertIn("could not find an active RealMindX verification request", reply_mock.call_args.args[1])

    @patch("backend.api.whatsapp.send_whatsapp_text", return_value=True)
    def test_whatsapp_webhook_verifies_multiple_numbers_concurrently(self, reply_mock):
        second_user = User(
            email="second@example.com",
            first_name="Second",
            last_name="User",
            role=Role.query.filter_by(name="user").one(),
            is_active=True,
            is_verified=True,
        )
        second_user.set_password("Password123!")
        db.session.add(second_user)
        db.session.commit()

        first_challenge = self.client.post(
            "/api/me/contact-change/request",
            json={"field": "phone", "value": "024 000 0000", "channel": "whatsapp"},
        ).get_json()
        self.client.post("/api/auth/logout", json={})
        self.client.post("/api/auth/login", json={"email": "second@example.com", "password": "Password123!"})
        second_challenge = self.client.post(
            "/api/me/contact-change/request",
            json={"field": "phone", "value": "055 000 0000", "channel": "whatsapp"},
        ).get_json()
        payload = {
            "entry": [{
                "changes": [{
                    "value": {
                        "metadata": {"phone_number_id": "123456789"},
                        "messages": [
                            {
                                "id": "wamid.concurrent-1",
                                "from": "233240000000",
                                "type": "text",
                                "text": {"body": " Verify my RealMindX number "},
                            },
                            {
                                "id": "wamid.concurrent-2",
                                "from": "233550000000",
                                "type": "text",
                                "text": {"body": "VERIFY MY REALMINDX NUMBER"},
                            },
                        ],
                    },
                }],
            }],
        }

        webhook = self.client.post("/api/webhooks/whatsapp", json=payload)

        self.assertEqual(webhook.status_code, 200)
        self.assertEqual([result["status"] for result in webhook.get_json()["results"]], ["verified", "verified"])
        self.assertEqual(reply_mock.call_count, 2)
        self.assertIsNotNone(db.session.get(ContactChangeToken, first_challenge["challenge_id"]).used_at)
        self.assertIsNotNone(db.session.get(ContactChangeToken, second_challenge["challenge_id"]).used_at)
        db.session.expire_all()
        self.assertTrue(User.query.filter_by(email="contact@example.com").one().phone_verified)
        self.assertTrue(User.query.filter_by(email="second@example.com").one().phone_verified)

    def test_another_user_cannot_start_active_whatsapp_verification_for_same_number(self):
        self.client.post(
            "/api/me/contact-change/request",
            json={"field": "phone", "value": "024 000 0000", "channel": "whatsapp"},
        )
        second_user = User(
            email="second@example.com",
            first_name="Second",
            last_name="User",
            role=Role.query.filter_by(name="user").one(),
            is_active=True,
            is_verified=True,
        )
        second_user.set_password("Password123!")
        db.session.add(second_user)
        db.session.commit()
        self.client.post("/api/auth/logout", json={})
        self.client.post("/api/auth/login", json={"email": "second@example.com", "password": "Password123!"})

        blocked = self.client.post(
            "/api/me/contact-change/request",
            json={"field": "phone", "value": "+233240000000", "channel": "whatsapp"},
        )

        self.assertEqual(blocked.status_code, 409)
        self.assertIn("already in progress", blocked.get_json()["error"])
        self.assertEqual(
            ContactChangeToken.query.filter_by(
                field="phone",
                delivery_channel="whatsapp_inbound",
                target_value="+233240000000",
                used_at=None,
            ).count(),
            1,
        )

    def test_same_user_can_restart_same_whatsapp_number_after_cooldown(self):
        first = self.client.post(
            "/api/me/contact-change/request",
            json={"field": "phone", "value": "024 000 0000", "channel": "whatsapp"},
        )
        first_id = first.get_json()["challenge_id"]
        first_row = db.session.get(ContactChangeToken, first_id)
        first_row.created_at = datetime.now(timezone.utc) - timedelta(minutes=2)
        db.session.commit()

        second = self.client.post(
            "/api/me/contact-change/request",
            json={"field": "phone", "value": "+233240000000", "channel": "whatsapp"},
        )

        self.assertEqual(second.status_code, 200)
        self.assertNotEqual(second.get_json()["challenge_id"], first_id)
        db.session.expire_all()
        old_row = db.session.get(ContactChangeToken, first_id)
        new_row = db.session.get(ContactChangeToken, second.get_json()["challenge_id"])
        self.assertIsNotNone(old_row.used_at)
        self.assertEqual(old_row.status, "cancelled")
        self.assertIsNone(old_row.active_lock_key)
        self.assertEqual(new_row.status, "pending")
        self.assertEqual(new_row.active_lock_key, "+233240000000")

    def test_database_prevents_duplicate_active_whatsapp_verification_locks(self):
        first = ContactChangeToken(
            user_id=User.query.filter_by(email="contact@example.com").one().id,
            field="phone",
            target_value="+233240000000",
            delivery_channel="whatsapp_inbound",
            active_lock_key="+233240000000",
            token_hash="unused",
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
        )
        second = ContactChangeToken(
            user_id=User.query.filter_by(email="contact@example.com").one().id,
            field="phone",
            target_value="+233240000000",
            delivery_channel="whatsapp_inbound",
            active_lock_key="+233240000000",
            token_hash="unused",
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
        )
        db.session.add_all([first, second])

        with self.assertRaises(IntegrityError):
            db.session.commit()
        db.session.rollback()

    @patch("backend.api.whatsapp.send_whatsapp_text", return_value=True)
    def test_whatsapp_webhook_does_not_verify_ordinary_hi_with_active_request(self, reply_mock):
        challenge = self.client.post(
            "/api/me/contact-change/request",
            json={"field": "phone", "value": "024 000 0000", "channel": "whatsapp"},
        ).get_json()
        payload = {
            "entry": [{
                "changes": [{
                    "value": {
                        "metadata": {"phone_number_id": "123456789"},
                        "messages": [{
                            "id": "wamid.wrong-message",
                            "from": "233240000000",
                            "type": "text",
                            "text": {"body": "Hi"},
                        }],
                    },
                }],
            }],
        }

        webhook = self.client.post("/api/webhooks/whatsapp", json=payload)
        self.assertEqual(webhook.status_code, 200)
        self.assertEqual(webhook.get_json()["results"][0]["status"], "fallback_redirect")
        self.assertEqual(webhook.get_json()["results"][0]["reply_status"], "sent")
        reply_mock.assert_called_once()
        status = self.client.get(f"/api/me/contact-change/{challenge['challenge_id']}/status")
        status_data = status.get_json()
        self.assertEqual(status_data["status"], "pending")
        self.assertFalse(status_data["wrong_message"])
        db.session.expire_all()
        user = User.query.filter_by(email="contact@example.com").one()
        self.assertFalse(user.phone_verified)
        self.assertIsNone(user.phone_verified_at)

    @patch("backend.api.whatsapp.send_whatsapp_text", return_value=True)
    def test_whatsapp_webhook_replies_once_for_recently_verified_number(self, reply_mock):
        user = User.query.filter_by(email="contact@example.com").one()
        verified_at = datetime.now(timezone.utc) - timedelta(minutes=5)
        user.phone = "+233240000000"
        user.phone_verified = True
        user.phone_verified_at = verified_at
        db.session.commit()
        payload = {
            "entry": [{
                "changes": [{
                    "value": {
                        "metadata": {"phone_number_id": "123456789"},
                        "messages": [{
                            "id": "wamid.already-1",
                            "from": "233240000000",
                            "type": "text",
                            "text": {"body": WHATSAPP_VERIFICATION_PHRASE},
                        }],
                    },
                }],
            }],
        }

        first = self.client.post("/api/webhooks/whatsapp", json=payload)
        payload["entry"][0]["changes"][0]["value"]["messages"][0]["id"] = "wamid.already-2"
        second = self.client.post("/api/webhooks/whatsapp", json=payload)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.get_json()["results"][0]["status"], "already_verified_recent")
        self.assertEqual(second.get_json()["results"][0]["status"], "already_verified_recent_suppressed")
        self.assertEqual(reply_mock.call_count, 1)
        self.assertIn("already been verified successfully", reply_mock.call_args.args[1])
        db.session.expire_all()
        self.assertEqual(User.query.filter_by(email="contact@example.com").one().phone_verified_at, verified_at.replace(tzinfo=None))

    @patch("backend.api.whatsapp.send_whatsapp_text", return_value=True)
    def test_whatsapp_webhook_replies_to_expired_code(self, reply_mock):
        challenge = self.client.post(
            "/api/me/contact-change/request",
            json={"field": "phone", "value": "024 000 0000", "channel": "whatsapp"},
        ).get_json()
        row = db.session.get(ContactChangeToken, challenge["challenge_id"])
        row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.session.commit()
        payload = {
            "entry": [{
                "changes": [{
                    "value": {
                        "metadata": {"phone_number_id": "123456789"},
                        "messages": [{
                            "id": "wamid.expired",
                            "from": "233240000000",
                            "type": "text",
                            "text": {"body": WHATSAPP_VERIFICATION_PHRASE},
                        }],
                    },
                }],
            }],
        }

        webhook = self.client.post("/api/webhooks/whatsapp", json=payload)

        self.assertEqual(webhook.status_code, 200)
        self.assertEqual(webhook.get_json()["results"][0]["status"], "verification_failed")
        self.assertEqual(webhook.get_json()["results"][0]["failure_reason"], "expired")
        reply_mock.assert_called_once()
        self.assertIn("expired", reply_mock.call_args.args[1])
        db.session.expire_all()
        expired_row = db.session.get(ContactChangeToken, challenge["challenge_id"])
        self.assertEqual(expired_row.status, "expired")
        self.assertIsNone(expired_row.active_lock_key)

    @patch("backend.api.whatsapp.send_whatsapp_text", return_value=True)
    def test_whatsapp_webhook_treats_old_verified_number_as_ordinary_enquiry(self, reply_mock):
        user = User.query.filter_by(email="contact@example.com").one()
        user.phone = "+233240000000"
        user.phone_verified = True
        user.phone_verified_at = datetime.now(timezone.utc) - timedelta(minutes=16)
        db.session.commit()
        payload = {
            "entry": [{
                "changes": [{
                    "value": {
                        "metadata": {"phone_number_id": "123456789"},
                        "messages": [{
                            "id": "wamid.old-verified",
                            "from": "233240000000",
                            "type": "text",
                            "text": {"body": "Hello"},
                        }],
                    },
                }],
            }],
        }

        webhook = self.client.post("/api/webhooks/whatsapp", json=payload)

        self.assertEqual(webhook.status_code, 200)
        self.assertEqual(webhook.get_json()["results"][0]["status"], "fallback_redirect")
        reply_mock.assert_called_once()
        self.assertIn("Thank you for contacting RealMindX Education Ltd.", reply_mock.call_args.args[1])

    @patch("backend.api.whatsapp.send_whatsapp_text", return_value=True)
    def test_whatsapp_webhook_is_idempotent_by_incoming_message_id(self, reply_mock):
        challenge = self.client.post(
            "/api/me/contact-change/request",
            json={"field": "phone", "value": "024 000 0000", "channel": "whatsapp"},
        ).get_json()
        payload = {
            "entry": [{
                "changes": [{
                    "value": {
                        "metadata": {"phone_number_id": "123456789"},
                        "messages": [{
                            "id": "wamid.duplicate",
                            "from": "233240000000",
                            "type": "text",
                            "text": {"body": WHATSAPP_VERIFICATION_PHRASE},
                        }],
                    },
                }],
            }],
        }

        first = self.client.post("/api/webhooks/whatsapp", json=payload)
        second = self.client.post("/api/webhooks/whatsapp", json=payload)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.get_json()["results"][0]["status"], "verified")
        self.assertEqual(second.get_json()["results"][0]["status"], "duplicate")
        self.assertEqual(reply_mock.call_count, 1)
        self.assertEqual(WhatsAppWebhookEvent.query.filter_by(message_id="wamid.duplicate").count(), 1)

    @patch("backend.api.whatsapp.send_whatsapp_text", return_value=True)
    def test_whatsapp_webhook_replies_once_to_ordinary_text(self, reply_mock):
        payload = {
            "entry": [{
                "changes": [{
                    "value": {
                        "metadata": {"phone_number_id": "123456789"},
                        "messages": [{
                            "id": "wamid.chat",
                            "from": "233555000111",
                            "type": "text",
                            "text": {"body": "Hello, I need help"},
                        }],
                    },
                }],
            }],
        }

        first = self.client.post("/api/webhooks/whatsapp", json=payload)
        payload["entry"][0]["changes"][0]["value"]["messages"][0]["id"] = "wamid.chat-again"
        second = self.client.post("/api/webhooks/whatsapp", json=payload)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.get_json()["results"][0]["status"], "fallback_redirect")
        self.assertEqual(second.get_json()["results"][0]["status"], "fallback_redirect_suppressed")
        self.assertEqual(reply_mock.call_count, 1)
        self.assertIn("Thank you for contacting RealMindX Education Ltd.", reply_mock.call_args.args[1])
        self.assertIn("used only for automatic phone-number verification", reply_mock.call_args.args[1])
        self.assertIn("+233 20 116 6122", reply_mock.call_args.args[1])

    @patch("backend.api.whatsapp.send_whatsapp_text", return_value=True)
    def test_whatsapp_webhook_does_not_reply_to_status_updates(self, reply_mock):
        payload = {
            "entry": [{
                "changes": [{
                    "value": {
                        "metadata": {"phone_number_id": "123456789"},
                        "statuses": [{
                            "id": "wamid.status",
                            "status": "delivered",
                            "recipient_id": "233240000000",
                        }],
                    },
                }],
            }],
        }

        webhook = self.client.post("/api/webhooks/whatsapp", json=payload)

        self.assertEqual(webhook.status_code, 200)
        self.assertEqual(webhook.get_json()["results"], [])
        reply_mock.assert_not_called()

    @patch("backend.api.profile.send_sms", return_value=True)
    def test_increasing_resend_cooldown_is_enforced(self, _send_sms_mock):
        first = self.client.post(
            "/api/me/contact-change/request",
            json={"field": "phone", "value": "0240000000", "channel": "sms"},
        )
        self.assertEqual(first.status_code, 200)

        blocked = self.client.post(
            "/api/me/contact-change/request",
            json={"field": "phone", "value": "0240000000", "channel": "whatsapp"},
        )
        self.assertEqual(blocked.status_code, 429)
        self.assertGreater(blocked.get_json()["retry_after_seconds"], 0)
        self.assertEqual(_send_sms_mock.call_count, 1)

    @patch("backend.api.profile.send_sms", return_value=True)
    @patch("backend.api.profile.secrets.randbelow", return_value=123456)
    def test_sms_verification_still_sets_phone_verified_at(self, _rand_mock, _send_sms_mock):
        request_response = self.client.post(
            "/api/me/contact-change/request",
            json={"field": "phone", "value": "0240000000", "channel": "sms"},
        )
        self.assertEqual(request_response.status_code, 200)
        challenge_id = request_response.get_json()["challenge_id"]

        verify_response = self.client.post(
            "/api/me/contact-change/verify",
            json={"challenge_id": challenge_id, "otp": "123456"},
        )

        self.assertEqual(verify_response.status_code, 200)
        db.session.expire_all()
        user = User.query.filter_by(email="contact@example.com").one()
        challenge = db.session.get(ContactChangeToken, challenge_id)
        self.assertEqual(user.phone, "+233240000000")
        self.assertTrue(user.phone_verified)
        self.assertIsNotNone(user.phone_verified_at)
        self.assertEqual(challenge.status, "verified")
        self.assertIsNotNone(challenge.verified_at)

    def test_rejects_unknown_phone_channel(self):
        response = self.client.post(
            "/api/me/contact-change/request",
            json={"field": "phone", "value": "0240000000", "channel": "telegram"},
        )
        self.assertEqual(response.status_code, 400)

    def test_one_identity_can_enable_bookshop_without_losing_teacher_service(self):
        self.client.post("/api/auth/logout", json={})
        response = self.client.post(
            "/api/auth/login",
            json={
                "email": "contact@example.com",
                "password": "Password123!",
                "surface": "bookshop",
            },
        )
        self.assertEqual(response.status_code, 200)
        db.session.expire_all()
        user = User.query.filter_by(email="contact@example.com").one()
        self.assertTrue(user.teacher_service_enabled)
        self.assertTrue(user.bookshop_service_enabled)

    def test_phone_does_not_reduce_teacher_profile_completion(self):
        profile = SimpleNamespace(
            location="Accra",
            teaching_subject="Mathematics",
            preferred_level="JHS",
            preferred_employment_type="Full time",
            curriculum_experience="GES",
            cv_file_id=1,
            certificate_file_id=2,
        )
        user = SimpleNamespace(email="complete@example.com", first_name="Complete", phone=None, phone_verified=False, profile=profile)
        percentage, missing = teacher_profile_completion(user)
        self.assertEqual(percentage, 100)
        self.assertNotIn("Verified phone number", missing)

    def test_remembered_login_uses_a_persistent_server_session(self):
        self.client.post("/api/auth/logout", json={})
        response = self.client.post(
            "/api/auth/login",
            json={"email": "contact@example.com", "password": "Password123!", "remember": True},
        )
        self.assertEqual(response.status_code, 200)
        with self.client.session_transaction() as flask_session:
            self.assertTrue(flask_session.permanent)
        cookies = "\n".join(response.headers.getlist("Set-Cookie"))
        self.assertIn("remember_token=", cookies)
        self.assertIn("Expires=", cookies)

    @patch("backend.whatsapp_service.requests.post")
    def test_whatsapp_service_sends_authentication_template(self, post_mock):
        post_mock.return_value = Mock(
            ok=True,
            status_code=200,
            json=Mock(return_value={"messages": [{"id": "wamid.test"}]}),
        )

        self.assertTrue(send_whatsapp_otp("0240000000", "654321"))
        request_kwargs = post_mock.call_args.kwargs
        payload = request_kwargs["json"]
        self.assertEqual(payload["to"], "233240000000")
        self.assertEqual(payload["template"]["name"], "realmindx_verification_code")
        self.assertEqual(payload["template"]["components"][0]["parameters"][0]["text"], "654321")
        self.assertEqual(payload["template"]["components"][1]["parameters"][0]["text"], "654321")
        self.assertNotIn("test-token", str(payload))


if __name__ == "__main__":
    unittest.main()
