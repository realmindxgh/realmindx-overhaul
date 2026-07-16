import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

SITE_ROOT = Path(__file__).resolve().parents[1]
if str(SITE_ROOT) not in sys.path:
    sys.path.insert(0, str(SITE_ROOT))

from backend import create_app
from backend.config import Config
from backend.extensions import db
from backend.models import Role, User, WhatsAppWebhookEvent
from backend.profile_completion import teacher_profile_completion
from backend.whatsapp_service import send_whatsapp_otp


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
        self.assertEqual(data["whatsapp_number"], "+233201166122")
        self.assertIn("RMX VERIFY", data["challenge_phrase"])
        self.assertIn("wa.me/233201166122", data["whatsapp_url"])
        self.assertFalse(data["manual_entry_allowed"])
        self.assertEqual(data["next_request_in_seconds"], 45)
        self.assertIn("WhatsApp", data["message"])

    def test_whatsapp_phone_verification_can_be_disabled(self):
        self.app.config["WHATSAPP_PHONE_VERIFICATION_ENABLED"] = False

        response = self.client.post(
            "/api/me/contact-change/request",
            json={"field": "phone", "value": "024 000 0000", "channel": "whatsapp"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("temporarily unavailable", response.get_json()["error"])

    def test_whatsapp_inbound_challenge_cannot_be_typed_into_site(self):
        challenge = self.client.post(
            "/api/me/contact-change/request",
            json={"field": "phone", "value": "024 000 0000", "channel": "whatsapp"},
        ).get_json()

        response = self.client.post(
            "/api/me/contact-change/verify",
            json={"challenge_id": challenge["challenge_id"], "otp": challenge["challenge_code"]},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("WhatsApp challenge", response.get_json()["error"])

    def test_whatsapp_webhook_verifies_matching_sender(self):
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
                            "text": {"body": challenge["challenge_phrase"]},
                        }],
                    },
                }],
            }],
        }

        webhook = self.client.post("/api/webhooks/whatsapp", json=payload)
        self.assertEqual(webhook.status_code, 200)
        self.assertEqual(webhook.get_json()["results"][0]["status"], "verified")
        event = WhatsAppWebhookEvent.query.filter_by(message_id="wamid.correct").one()
        self.assertEqual(event.status, "verified")
        self.assertEqual(event.phone_number_id, "123456789")
        status = self.client.get(f"/api/me/contact-change/{challenge['challenge_id']}/status")
        self.assertTrue(status.get_json()["verified"])
        db.session.expire_all()
        user = User.query.filter_by(email="contact@example.com").one()
        self.assertEqual(user.phone, "+233240000000")
        self.assertTrue(user.phone_verified)

    def test_whatsapp_webhook_reports_wrong_sender_number(self):
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
                            "text": {"body": challenge["challenge_phrase"]},
                        }],
                    },
                }],
            }],
        }

        webhook = self.client.post("/api/webhooks/whatsapp", json=payload)
        self.assertEqual(webhook.status_code, 200)
        self.assertEqual(webhook.get_json()["results"][0]["status"], "wrong_number")
        status = self.client.get(f"/api/me/contact-change/{challenge['challenge_id']}/status")
        status_data = status.get_json()
        self.assertEqual(status_data["status"], "wrong_number")
        self.assertTrue(status_data["wrong_number"])
        self.assertIn("different WhatsApp number", status_data["message"])

    def test_whatsapp_webhook_reports_wrong_message_from_correct_number(self):
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
                            "text": {"body": f"{challenge['challenge_phrase']} please"},
                        }],
                    },
                }],
            }],
        }

        webhook = self.client.post("/api/webhooks/whatsapp", json=payload)
        self.assertEqual(webhook.status_code, 200)
        self.assertEqual(webhook.get_json()["results"][0]["status"], "wrong_message")
        status = self.client.get(f"/api/me/contact-change/{challenge['challenge_id']}/status")
        status_data = status.get_json()
        self.assertEqual(status_data["status"], "wrong_message")
        self.assertTrue(status_data["wrong_message"])
        self.assertIn("did not match the challenge", status_data["message"])

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
