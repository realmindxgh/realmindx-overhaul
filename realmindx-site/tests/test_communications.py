import ast
import sys
import json
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import Mock, PropertyMock, patch

SITE_ROOT = Path(__file__).resolve().parents[1]
if str(SITE_ROOT) not in sys.path:
    sys.path.insert(0, str(SITE_ROOT))

from backend import create_app
from backend.config import Config
from backend.extensions import db
from backend.models import (
    AccountSecurityCode,
    CommunicationAttempt,
    EmailVerificationToken,
    Role,
    User,
    UserProfile,
)
from backend.communications import (
    CommunicationResult,
    CommunicationMode,
    CommunicationStatus,
    CommunicationPurpose,
    generate_batch_id,
    mask_destination,
    record_attempt,
    resolve_communication_mode,
)


class CommunicationTestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    SECRET_KEY = "comm-tests"
    BASE_URL = "http://localhost"
    CORS_ORIGINS = ["http://localhost"]
    RATELIMIT_ENABLED = False
    ENV = "development"
    COMMUNICATION_MODE = "mock"
    DEFAULT_FROM_EMAIL = "noreply@realmindxgh.com"
    DEFAULT_REPLY_TO_EMAIL = "support@realmindxgh.com"
    RESEND_API_KEY = ""
    MAIL_SERVER = ""
    MAIL_USERNAME = ""
    MAIL_PASSWORD = ""
    MAIL_PORT = 587
    MAIL_USE_TLS = True
    ARKESEL_API_KEY = ""
    ARKESEL_SENDER_ID = "RealMindX"
    WHATSAPP_ACCESS_TOKEN = ""
    WHATSAPP_PHONE_NUMBER_ID = ""
    WHATSAPP_GRAPH_API_VERSION = "v23.0"
    WHATSAPP_OTP_TEMPLATE_NAME = "realmindx_verification_code"
    WHATSAPP_OTP_TEMPLATE_LANGUAGE = "en_US"


class CommunicationContractTests(unittest.TestCase):
    def test_valid_result_defaults(self):
        r = CommunicationResult(
            channel="email", purpose="transactional", provider="mock",
            mode="mock", status="mocked",
        )
        self.assertEqual(r.channel, "email")
        self.assertEqual(r.status, "mocked")

    def test_invalid_mode_raises(self):
        with self.assertRaises(ValueError, msg="Invalid communication mode: bogus"):
            CommunicationResult(
                channel="email", purpose="transactional", provider="none",
                mode="bogus", status="disabled",
            )

    def test_invalid_status_raises(self):
        with self.assertRaises(ValueError, msg="Invalid communication status: unknown"):
            CommunicationResult(
                channel="sms", purpose="security", provider="mock",
                mode="mock", status="unknown",
            )

    def test_invalid_purpose_raises(self):
        with self.assertRaises(ValueError, msg="Invalid purpose: spam"):
            CommunicationResult(
                channel="email", purpose="spam", provider="mock",
                mode="mock", status="mocked",
            )

    def test_all_enum_values(self):
        for m in CommunicationMode:
            for s in CommunicationStatus:
                for p in CommunicationPurpose:
                    r = CommunicationResult(
                        channel="email", purpose=p.value, provider="mock",
                        mode=m.value, status=s.value,
                    )
                    self.assertEqual(r.mode, m.value)

    def test_generate_batch_id(self):
        bid1 = generate_batch_id()
        bid2 = generate_batch_id()
        self.assertNotEqual(bid1, bid2)
        self.assertIsInstance(bid1, str)
        self.assertEqual(len(bid1), 36)  # uuid4 hex


class MaskDestinationTests(unittest.TestCase):
    def test_email_masks_middle(self):
        self.assertEqual(mask_destination("email", "john.doe@example.com"), "jo******@example.com")

    def test_email_short_local_part(self):
        self.assertEqual(mask_destination("email", "ab@example.com"), "a**@example.com")

    def test_email_empty(self):
        self.assertEqual(mask_destination("email", ""), "")

    def test_phone_shows_last_four(self):
        self.assertEqual(mask_destination("sms", "+233541234567"), "*** *** 4567")

    def test_phone_short_number(self):
        self.assertEqual(mask_destination("sms", "123"), "*** *** 123")

    def test_phone_non_digit_stripped(self):
        self.assertEqual(mask_destination("sms", "+233 (0) 54 123 4567"), "*** *** 4567")

    def test_phone_empty(self):
        self.assertEqual(mask_destination("sms", ""), "")


class ResolveCommunicationModeTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(CommunicationTestConfig)
        self.context = self.app.app_context()
        self.context.push()

    def tearDown(self):
        self.context.pop()

    def test_configured_mode_takes_priority(self):
        self.assertEqual(resolve_communication_mode(self.app), "mock")

    def test_production_defaults_to_live(self):
        self.app.config["ENV"] = "production"
        self.app.config["COMMUNICATION_MODE"] = ""
        self.assertEqual(resolve_communication_mode(self.app), "live")

    def test_development_defaults_to_mock(self):
        self.app.config["ENV"] = "development"
        self.app.config["COMMUNICATION_MODE"] = ""
        self.assertEqual(resolve_communication_mode(self.app), "mock")

    def test_invalid_mode_falls_back(self):
        self.app.config["COMMUNICATION_MODE"] = "bogus"
        self.app.config["ENV"] = "development"
        self.assertEqual(resolve_communication_mode(self.app), "mock")

    def test_disabled_mode(self):
        self.app.config["COMMUNICATION_MODE"] = "disabled"
        self.assertEqual(resolve_communication_mode(self.app), "disabled")


class RecordAttemptTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(CommunicationTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        role = Role(name="user", description="Teacher")
        user = User(
            email="test@example.com", first_name="Test", last_name="User",
            role=role, is_active=True, is_verified=True,
        )
        user.set_password("Password123!")
        db.session.add_all([role, user])
        db.session.commit()
        self.user = user

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.context.pop()

    def test_record_attempt_creates_row(self):
        attempt_id = record_attempt(
            channel="email", purpose="transactional", recipient_user_id=self.user.id,
            masked_destination="t***@example.com", template_name="welcome",
            provider="mock", mode="mock", status="mocked",
            provider_message_id="mock-abc123",
        )
        self.assertIsNotNone(attempt_id)
        row = db.session.get(CommunicationAttempt, attempt_id)
        self.assertIsNotNone(row)
        self.assertEqual(row.channel, "email")
        self.assertEqual(row.purpose, "transactional")
        self.assertEqual(row.recipient_user_id, self.user.id)
        self.assertEqual(row.status, "mocked")
        self.assertEqual(row.provider_message_id, "mock-abc123")
        self.assertIsNone(row.delivered_at)
        self.assertIsNone(row.failed_at)

    def test_record_attempt_failed_sets_failed_at(self):
        attempt_id = record_attempt(
            channel="sms", purpose="security", recipient_user_id=self.user.id,
            masked_destination="*** *** 4567", template_name=None,
            provider="arkesel", mode="live", status="failed",
            error_code="provider_error",
        )
        row = db.session.get(CommunicationAttempt, attempt_id)
        self.assertIsNotNone(row.failed_at)
        self.assertIsNone(row.accepted_at)
        self.assertEqual(row.error_code, "provider_error")

    def test_record_attempt_accepted_sets_accepted_at(self):
        attempt_id = record_attempt(
            channel="email", purpose="transactional", recipient_user_id=None,
            masked_destination=None, template_name=None,
            provider="resend", mode="live", status="accepted",
        )
        row = db.session.get(CommunicationAttempt, attempt_id)
        self.assertIsNotNone(row.accepted_at)
        self.assertIsNone(row.failed_at)
        self.assertEqual(row.provider, "resend")


class EmailServiceTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(CommunicationTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        db.session.commit()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.context.pop()

    def _make_message(self, to="recipient@example.com"):
        from backend.email_service import OutboundEmail
        return OutboundEmail(to=to, subject="Test", html="<p>Hello</p>")

    def test_send_email_disabled_mode(self):
        self.app.config["COMMUNICATION_MODE"] = "disabled"
        from backend.email_service import send_email
        result = send_email(self._make_message(), purpose="transactional")
        self.assertEqual(result.status, "disabled")
        self.assertEqual(result.error_code, "mode_disabled")

    def test_send_email_mock_mode(self):
        self.app.config["COMMUNICATION_MODE"] = "mock"
        from backend.email_service import send_email
        result = send_email(self._make_message())
        self.assertEqual(result.status, "mocked")
        self.assertEqual(result.provider, "mock")
        self.assertIn("mock-", result.provider_message_id or "")

    @patch("backend.email_service.requests.post")
    def test_send_email_resend_success(self, mock_post):
        self.app.config["COMMUNICATION_MODE"] = "live"
        self.app.config["RESEND_API_KEY"] = "re_123"
        mock_response = Mock()
        mock_response.ok = True
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {"id": "resend-abc"}
        mock_post.return_value = mock_response

        from backend.email_service import send_email
        result = send_email(self._make_message(), purpose="transactional")
        self.assertEqual(result.status, "accepted")
        self.assertEqual(result.provider, "resend")
        self.assertEqual(result.provider_message_id, "resend-abc")

    @patch("backend.email_service.requests.post")
    def test_send_email_resend_unauthorized(self, mock_post):
        self.app.config["COMMUNICATION_MODE"] = "live"
        self.app.config["RESEND_API_KEY"] = "re_bad"
        mock_response = Mock()
        mock_response.ok = False
        mock_response.status_code = 401
        exc = __import__("requests").RequestException(response=mock_response)
        exc.response = mock_response
        mock_post.side_effect = exc

        from backend.email_service import send_email
        result = send_email(self._make_message(), purpose="transactional")
        self.assertEqual(result.status, "failed")
        self.assertEqual(result.error_code, "invalid_credentials")
        self.assertIn("unauthorized", (result.error_message or "").lower())

    @patch("backend.email_service.requests.post")
    def test_send_email_resend_falls_to_smtp(self, mock_post):
        self.app.config["COMMUNICATION_MODE"] = "live"
        self.app.config["RESEND_API_KEY"] = "re_bad"
        mock_response = Mock()
        mock_response.status_code = 500
        exc = __import__("requests").RequestException(response=mock_response)
        exc.response = mock_response
        mock_post.side_effect = exc

        self.app.config["MAIL_SERVER"] = "smtp.example.com"
        self.app.config["MAIL_USERNAME"] = "user"
        self.app.config["MAIL_PASSWORD"] = "pass"
        self.app.config["MAIL_PORT"] = 587
        self.app.config["MAIL_USE_TLS"] = True

        smtp_mock = unittest.mock.patch("backend.email_service.smtplib.SMTP")
        with smtp_mock as mock_smtp:
            instance = Mock()
            mock_smtp.return_value.__enter__.return_value = instance

            from backend.email_service import send_email
            result = send_email(self._make_message(), purpose="transactional")
            self.assertEqual(result.status, "accepted")
            self.assertEqual(result.provider, "smtp")
            instance.send_message.assert_called_once()

    def test_send_email_no_provider_configured(self):
        self.app.config["COMMUNICATION_MODE"] = "live"
        self.app.config["RESEND_API_KEY"] = ""
        self.app.config["MAIL_SERVER"] = ""
        self.app.config["MAIL_USERNAME"] = ""
        self.app.config["MAIL_PASSWORD"] = ""

        from backend.email_service import send_email
        result = send_email(self._make_message(), purpose="transactional")
        self.assertEqual(result.status, "failed")
        self.assertEqual(result.error_code, "missing_credentials")

    def test_send_email_mock_creates_attempt_record(self):
        self.app.config["COMMUNICATION_MODE"] = "mock"
        from backend.email_service import send_email
        result = send_email(self._make_message(), purpose="service_reminder", template_name="profile_reminder")
        self.assertEqual(result.status, "mocked")
        self.assertEqual(result.template_name, "profile_reminder")
        attempts = CommunicationAttempt.query.filter_by(channel="email").all()
        self.assertEqual(len(attempts), 1)
        self.assertEqual(attempts[0].template_name, "profile_reminder")
        self.assertEqual(attempts[0].purpose, "service_reminder")

    @patch("backend.email_service.send_email", return_value=Mock(status="accepted"))
    def test_admin_alert_uses_canonical_info_inbox(self, send_email_mock):
        from backend.email_service import send_admin_alert

        result = send_admin_alert(
            subject="New operational event",
            html="<p>Review it.</p>",
            template_name="test_admin_alert",
        )

        self.assertEqual(result.status, "accepted")
        message = send_email_mock.call_args.args[0]
        self.assertEqual(message.to, "info@realmindxgh.com")
        self.assertEqual(send_email_mock.call_args.kwargs["purpose"], "admin_alert")
        self.assertEqual(send_email_mock.call_args.kwargs["template_name"], "test_admin_alert")

    def test_send_email_purpose_defaults_to_transactional(self):
        self.app.config["COMMUNICATION_MODE"] = "mock"
        from backend.email_service import send_email
        result = send_email(self._make_message())
        self.assertEqual(result.purpose, "transactional")


class SecurityEmailDeliveryTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(CommunicationTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        role = Role(name="user", description="Teacher")
        self.user = User(
            email="security@example.com",
            first_name="Security",
            last_name="User",
            role=role,
            is_active=True,
            is_verified=False,
        )
        self.user.set_password("Password123!")
        db.session.add_all([role, self.user])
        db.session.commit()
        self.client = self.app.test_client()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.context.pop()

    def test_verification_resend_records_attempt_and_keeps_mock_code_active_in_development(self):
        response = self.client.post(
            "/api/auth/resend-verification-otp",
            json={"email": self.user.email},
        )

        self.assertEqual(response.status_code, 200)
        token = EmailVerificationToken.query.filter_by(user_id=self.user.id).one()
        self.assertIsNone(token.used_at)
        attempt = CommunicationAttempt.query.filter_by(
            recipient_user_id=self.user.id,
            template_name="email_verification_otp",
        ).one()
        self.assertEqual(attempt.purpose, "security")
        self.assertEqual(attempt.status, "mocked")

    def test_live_provider_failure_returns_503_and_invalidates_code(self):
        self.app.config["COMMUNICATION_MODE"] = "live"

        response = self.client.post(
            "/api/auth/resend-verification-otp",
            json={"email": self.user.email},
        )

        self.assertEqual(response.status_code, 503)
        payload = response.get_json()
        self.assertEqual(payload["code"], "security_email_delivery_failed")
        self.assertNotIn("requires_verification", payload)
        token = EmailVerificationToken.query.filter_by(user_id=self.user.id).one()
        self.assertIsNotNone(token.used_at)
        attempt = CommunicationAttempt.query.filter_by(
            recipient_user_id=self.user.id,
            template_name="email_verification_otp",
        ).one()
        self.assertEqual(attempt.status, "failed")
        self.assertEqual(attempt.error_code, "missing_credentials")

    def test_production_mock_mode_cannot_claim_security_email_delivery(self):
        self.app.config["ENV"] = "production"
        self.app.config["COMMUNICATION_MODE"] = "mock"

        response = self.client.post(
            "/api/auth/resend-verification-otp",
            json={"email": self.user.email},
        )

        self.assertEqual(response.status_code, 503)
        token = EmailVerificationToken.query.filter_by(user_id=self.user.id).one()
        self.assertIsNotNone(token.used_at)
        attempt = CommunicationAttempt.query.filter_by(
            recipient_user_id=self.user.id,
            template_name="email_verification_otp",
        ).one()
        self.assertEqual(attempt.status, "mocked")

    @patch("backend.api.auth.secrets.randbelow", return_value=123456)
    def test_wrong_expired_and_replayed_verification_codes_are_rejected(self, _randbelow):
        requested = self.client.post(
            "/api/auth/resend-verification-otp",
            json={"email": self.user.email},
        )
        self.assertEqual(requested.status_code, 200)

        wrong = self.client.post(
            "/api/auth/verify-email-otp",
            json={"email": self.user.email, "otp": "000000"},
        )
        self.assertEqual(wrong.status_code, 400)

        token = EmailVerificationToken.query.filter_by(user_id=self.user.id).one()
        token.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.session.commit()
        expired = self.client.post(
            "/api/auth/verify-email-otp",
            json={"email": self.user.email, "otp": "123456"},
        )
        self.assertEqual(expired.status_code, 400)

        token.expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
        db.session.commit()
        accepted = self.client.post(
            "/api/auth/verify-email-otp",
            json={"email": self.user.email, "otp": "123456"},
        )
        self.assertEqual(accepted.status_code, 200)
        self.assertIsNotNone(token.used_at)

        replay = self.client.post(
            "/api/auth/verify-email-otp",
            json={"email": self.user.email, "otp": "123456"},
        )
        self.assertEqual(replay.status_code, 409)

    def test_two_factor_login_provider_failure_does_not_create_pending_session(self):
        self.user.is_verified = True
        self.user.two_factor_enabled = True
        db.session.commit()
        self.app.config["COMMUNICATION_MODE"] = "live"

        response = self.client.post(
            "/api/auth/login",
            json={"email": self.user.email, "password": "Password123!"},
        )

        self.assertEqual(response.status_code, 503)
        code = AccountSecurityCode.query.filter_by(
            user_id=self.user.id,
            purpose="login_two_factor",
        ).one()
        self.assertIsNotNone(code.used_at)
        with self.client.session_transaction() as session_state:
            self.assertNotIn("pending_two_factor_login", session_state)


class SmsServiceTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(CommunicationTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        db.session.commit()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.context.pop()

    def test_send_sms_disabled_mode(self):
        self.app.config["COMMUNICATION_MODE"] = "disabled"
        from backend.sms_service import send_sms
        result = send_sms("+233541234567", "Hello", purpose="security")
        self.assertEqual(result.status, "disabled")
        self.assertEqual(result.error_code, "mode_disabled")

    def test_send_sms_mock_mode(self):
        self.app.config["COMMUNICATION_MODE"] = "mock"
        from backend.sms_service import send_sms
        result = send_sms("+233541234567", "Hello", purpose="security")
        self.assertEqual(result.status, "mocked")
        self.assertIn("mock-", result.provider_message_id or "")

    def test_send_sms_missing_api_key(self):
        self.app.config["COMMUNICATION_MODE"] = "live"
        from backend.sms_service import send_sms
        result = send_sms("+233541234567", "Hello", purpose="security")
        self.assertEqual(result.status, "failed")
        self.assertEqual(result.error_code, "missing_credentials")

    def test_send_sms_invalid_phone(self):
        self.app.config["COMMUNICATION_MODE"] = "live"
        self.app.config["ARKESEL_API_KEY"] = "test-key"
        from backend.sms_service import send_sms
        result = send_sms("not-a-phone", "Hello", purpose="security")
        self.assertEqual(result.status, "failed")
        self.assertEqual(result.error_code, "invalid_recipient")

    def test_send_sms_normalised_destination_shown(self):
        self.app.config["COMMUNICATION_MODE"] = "mock"
        from backend.sms_service import send_sms
        result = send_sms("0541234567", "Hello", purpose="security")
        self.assertEqual(result.status, "mocked")
        self.assertIn("4567", result.masked_destination or "")

    @patch("backend.sms_service.requests.get")
    def test_send_sms_arkesel_success(self, mock_get):
        self.app.config["COMMUNICATION_MODE"] = "live"
        self.app.config["ARKESEL_API_KEY"] = "test-key"
        mock_response = Mock()
        mock_response.json.return_value = {"code": "ok", "balance": "10.00"}
        mock_get.return_value = mock_response

        from backend.sms_service import send_sms
        result = send_sms("+233541234567", "Hello", purpose="security")
        self.assertEqual(result.status, "accepted")
        self.assertEqual(result.provider, "arkesel")

    @patch("backend.sms_service.requests.get")
    def test_send_sms_arkesel_rejected(self, mock_get):
        self.app.config["COMMUNICATION_MODE"] = "live"
        self.app.config["ARKESEL_API_KEY"] = "test-key"
        mock_response = Mock()
        mock_response.json.return_value = {"code": "error", "message": "insufficient balance"}
        mock_get.return_value = mock_response

        from backend.sms_service import send_sms
        result = send_sms("+233541234567", "Hello", purpose="security")
        self.assertEqual(result.status, "rejected")
        self.assertEqual(result.error_code, "error")

    @patch("backend.sms_service.requests.get")
    def test_send_sms_arkesel_timeout(self, mock_get):
        self.app.config["COMMUNICATION_MODE"] = "live"
        self.app.config["ARKESEL_API_KEY"] = "test-key"
        mock_get.side_effect = __import__("requests").Timeout("timed out")

        from backend.sms_service import send_sms
        result = send_sms("+233541234567", "Hello", purpose="security")
        self.assertEqual(result.status, "failed")
        self.assertEqual(result.error_code, "timeout")
        self.assertTrue(result.retryable)

    def test_send_sms_creates_attempt_record(self):
        self.app.config["COMMUNICATION_MODE"] = "mock"
        from backend.sms_service import send_sms
        send_sms("+233541234567", "Hello", purpose="security", template_name="greeting")
        attempts = CommunicationAttempt.query.filter_by(channel="sms").all()
        self.assertEqual(len(attempts), 1)
        self.assertEqual(attempts[0].template_name, "greeting")


class SmsPhoneNormalisationTests(unittest.TestCase):
    def setUp(self):
        from backend.sms_service import normalise_phone
        self.n = normalise_phone

    def test_already_normalised(self):
        self.assertEqual(self.n("+233541234567"), "+233541234567")

    def test_local_format(self):
        self.assertEqual(self.n("0541234567"), "+233541234567")

    def test_without_plus_prefix(self):
        self.assertEqual(self.n("233541234567"), "+233541234567")

    def test_double_zero(self):
        self.assertEqual(self.n("00233541234567"), "+233541234567")

    def test_double_zero_non_ghana(self):
        self.assertIsNone(self.n("00441234567890"))

    def test_spaces_and_dashes(self):
        self.assertEqual(self.n("+233 54 123 4567"), "+233541234567")

    def test_too_short(self):
        self.assertIsNone(self.n("123"))

    def test_too_long(self):
        self.assertIsNone(self.n("+23354123456789"))


class WhatsAppServiceTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(CommunicationTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        db.session.commit()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.context.pop()

    def test_send_whatsapp_text_disabled(self):
        self.app.config["COMMUNICATION_MODE"] = "disabled"
        from backend.whatsapp_service import send_whatsapp_text
        result = send_whatsapp_text("+233541234567", "Hello", purpose="transactional")
        self.assertEqual(result.status, "disabled")
        self.assertEqual(result.error_code, "mode_disabled")

    def test_send_whatsapp_text_mock(self):
        self.app.config["COMMUNICATION_MODE"] = "mock"
        from backend.whatsapp_service import send_whatsapp_text
        result = send_whatsapp_text("+233541234567", "Hello", purpose="transactional")
        self.assertEqual(result.status, "mocked")
        self.assertIn("mock-", result.provider_message_id or "")

    def test_send_whatsapp_text_missing_credentials(self):
        self.app.config["COMMUNICATION_MODE"] = "live"
        self.app.config["WHATSAPP_ACCESS_TOKEN"] = ""
        self.app.config["WHATSAPP_PHONE_NUMBER_ID"] = ""
        from backend.whatsapp_service import send_whatsapp_text
        result = send_whatsapp_text("+233541234567", "Hello", purpose="transactional")
        self.assertEqual(result.status, "failed")
        self.assertEqual(result.error_code, "missing_credentials")

    def test_send_whatsapp_text_invalid_phone(self):
        self.app.config["COMMUNICATION_MODE"] = "live"
        self.app.config["WHATSAPP_ACCESS_TOKEN"] = "test"
        self.app.config["WHATSAPP_PHONE_NUMBER_ID"] = "123"
        from backend.whatsapp_service import send_whatsapp_text
        result = send_whatsapp_text("not-a-phone", "Hello", purpose="transactional")
        self.assertEqual(result.status, "failed")
        self.assertEqual(result.error_code, "invalid_recipient")

    @patch("backend.whatsapp_service.requests.post")
    def test_send_whatsapp_text_meta_success(self, mock_post):
        self.app.config["COMMUNICATION_MODE"] = "live"
        self.app.config["WHATSAPP_ACCESS_TOKEN"] = "test"
        self.app.config["WHATSAPP_PHONE_NUMBER_ID"] = "123"
        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {"messages": [{"id": "wamid.abc123"}]}
        mock_post.return_value = mock_response

        from backend.whatsapp_service import send_whatsapp_text
        result = send_whatsapp_text("+233541234567", "Hello", purpose="transactional")
        self.assertEqual(result.status, "accepted")
        self.assertEqual(result.provider_message_id, "wamid.abc123")
        self.assertEqual(result.provider, "meta")

    @patch("backend.whatsapp_service.requests.post")
    def test_send_whatsapp_text_meta_rejected(self, mock_post):
        self.app.config["COMMUNICATION_MODE"] = "live"
        self.app.config["WHATSAPP_ACCESS_TOKEN"] = "test"
        self.app.config["WHATSAPP_PHONE_NUMBER_ID"] = "123"
        mock_response = Mock()
        mock_response.ok = False
        mock_response.json.return_value = {"error": {"code": 100, "message": "Rate limit hit"}}
        mock_post.return_value = mock_response

        from backend.whatsapp_service import send_whatsapp_text
        result = send_whatsapp_text("+233541234567", "Hello", purpose="transactional")
        self.assertEqual(result.status, "rejected")
        self.assertEqual(result.error_code, "100")

    @patch("backend.whatsapp_service.requests.post")
    def test_send_whatsapp_text_timeout(self, mock_post):
        self.app.config["COMMUNICATION_MODE"] = "live"
        self.app.config["WHATSAPP_ACCESS_TOKEN"] = "test"
        self.app.config["WHATSAPP_PHONE_NUMBER_ID"] = "123"
        mock_post.side_effect = __import__("requests").Timeout("timed out")

        from backend.whatsapp_service import send_whatsapp_text
        result = send_whatsapp_text("+233541234567", "Hello", purpose="transactional")
        self.assertEqual(result.status, "failed")
        self.assertEqual(result.error_code, "timeout")
        self.assertTrue(result.retryable)

    def test_send_whatsapp_otp_mock(self):
        self.app.config["COMMUNICATION_MODE"] = "mock"
        from backend.whatsapp_service import send_whatsapp_otp
        result = send_whatsapp_otp("+233541234567", "123456", purpose="security")
        self.assertEqual(result.status, "mocked")

    @patch("backend.whatsapp_service.requests.post")
    def test_send_whatsapp_otp_meta_success(self, mock_post):
        self.app.config["COMMUNICATION_MODE"] = "live"
        self.app.config["WHATSAPP_ACCESS_TOKEN"] = "test"
        self.app.config["WHATSAPP_PHONE_NUMBER_ID"] = "123"
        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {"messages": [{"id": "wamid.otp123"}]}
        mock_post.return_value = mock_response

        from backend.whatsapp_service import send_whatsapp_otp
        result = send_whatsapp_otp("+233541234567", "123456", purpose="security")
        self.assertEqual(result.status, "accepted")
        self.assertEqual(result.provider_message_id, "wamid.otp123")
        called_payload = mock_post.call_args[1]["json"]
        self.assertEqual(called_payload["type"], "template")
        self.assertEqual(called_payload["template"]["name"], "realmindx_verification_code")


class AdminProfileReminderEndpointTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(CommunicationTestConfig)
        self.app.config["COMMUNICATION_MODE"] = "mock"
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        db.session.execute(db.text("PRAGMA foreign_keys = ON"))

        admin_role = Role(name="admin", description="Admin")
        teacher_role = Role(name="user", description="Teacher")
        self.admin = User(
            email="admin@example.com", first_name="Admin", last_name="User",
            role=admin_role, is_active=True, is_verified=True,
        )
        self.admin.set_password("AdminPass123!")
        self.teacher = User(
            email="teacher@example.com", first_name="Jane", last_name="Teacher",
            role=teacher_role, is_active=True, is_verified=True,
            teacher_service_enabled=True,
        )
        self.teacher.set_password("TeachPass1!")
        db.session.add_all([admin_role, teacher_role, self.admin, self.teacher])
        db.session.commit()
        UserProfile(user_id=self.teacher.id)
        db.session.commit()

        self.client = self.app.test_client()
        resp = self.client.post("/api/auth/login", json={
            "email": "admin@example.com", "password": "AdminPass123!",
        })
        self.assertEqual(resp.status_code, 200)

    def tearDown(self):
        db.session.remove()
        db.session.execute(db.text("PRAGMA foreign_keys = OFF"))
        db.session.commit()
        db.drop_all()
        self.context.pop()

    def test_individual_reminder_success_mock(self):
        resp = self.client.post(f"/api/admin/users/{self.teacher.id}/profile-reminder", json={})
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIn("message", data)
        self.assertIn("mock", data["message"].lower())

    def test_individual_reminder_inactive_teacher(self):
        self.teacher.is_active = False
        db.session.commit()
        resp = self.client.post(f"/api/admin/users/{self.teacher.id}/profile-reminder", json={})
        self.assertEqual(resp.status_code, 409)
        data = resp.get_json()
        self.assertIn("enable", (data.get("error") or "").lower())

    def test_individual_reminder_nonexistent_user(self):
        resp = self.client.post("/api/admin/users/99999/profile-reminder", json={})
        self.assertEqual(resp.status_code, 404)

    def test_individual_reminder_requires_admin(self):
        self.client.post("/api/auth/logout", json={})
        teacher_role = Role.query.filter_by(name="user").first()
        teacher = User(
            email="teacher2@example.com", first_name="No", last_name="Access",
            role=teacher_role, is_active=True, is_verified=True,
        )
        teacher.set_password("Pass123!")
        db.session.add(teacher)
        db.session.commit()
        self.client.post("/api/auth/login", json={
            "email": "teacher2@example.com", "password": "Pass123!",
        })
        resp = self.client.post(f"/api/admin/users/{self.teacher.id}/profile-reminder", json={})
        self.assertEqual(resp.status_code, 403)

    def test_individual_reminder_cooldown(self):
        from backend.communications import record_attempt
        record_attempt(
            channel="email", purpose="service_reminder",
            recipient_user_id=self.teacher.id,
            masked_destination="j***@example.com",
            template_name="profile_reminder",
            provider="resend", mode="live", status="accepted",
        )
        db.session.commit()
        resp = self.client.post(f"/api/admin/users/{self.teacher.id}/profile-reminder", json={})
        self.assertEqual(resp.status_code, 429)
        data = resp.get_json()
        self.assertIn("wait", (data.get("error") or "").lower())

    def test_batch_reminder_success(self):
        resp = self.client.post("/api/admin/users/profile-reminders", json={})
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIn("eligible", data)
        self.assertIn("accepted", data)
        self.assertIn("mocked", data)
        self.assertEqual(data["eligible"], 1)

    def test_batch_reminder_when_no_eligible_teachers(self):
        self.teacher.is_active = False
        db.session.commit()
        resp = self.client.post("/api/admin/users/profile-reminders", json={})
        data = resp.get_json()
        self.assertEqual(data["eligible"], 0)

    def test_newsletter_preview_uses_selected_letterhead(self):
        from backend.models import UploadedFile
        image = UploadedFile(
            original_filename="preview.jpg",
            stored_filename="preview.jpg",
            storage_path="images/preview.jpg",
            mime_type="image/jpeg",
            size_bytes=100,
            category="images",
            visibility="public",
        )
        db.session.add(image)
        db.session.commit()
        response = self.client.post("/api/admin/newsletters/preview", json={
            "brand": "bookshop",
            "sender": "bookshop",
            "subject": "Preview subject",
            "title": "Preview title",
            "sections": [{"heading": "Hello", "body": "<p>Formatted preview</p>", "image_position": "full", "image_file_id": image.id}],
        })
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["brand"], "bookshop")
        self.assertIn("RealMindX Bookshop", data["html"])
        self.assertIn("Formatted preview", data["html"])
        self.assertIn('width="576"', data["html"])
        self.assertIn("width:100%;max-width:100%", data["html"])
        self.assertIn('src="http://localhost/uploads/public/images/preview.jpg"', data["html"])

    def test_newsletter_preview_can_place_section_image_after_text(self):
        from backend.models import UploadedFile
        image = UploadedFile(
            original_filename="bottom.jpg",
            stored_filename="bottom.jpg",
            storage_path="images/bottom.jpg",
            mime_type="image/jpeg",
            size_bytes=100,
            category="images",
            visibility="public",
        )
        db.session.add(image)
        db.session.commit()

        response = self.client.post("/api/admin/newsletters/preview", json={
            "subject": "Placement preview",
            "title": "Placement preview",
            "sections": [{
                "heading": "Before the image",
                "body": "<p>Section body before image</p>",
                "image_position": "bottom",
                "image_file_id": image.id,
            }],
        })

        self.assertEqual(response.status_code, 200)
        html = response.get_json()["html"]
        self.assertLess(html.index("Section body before image"), html.index("bottom.jpg"))
        self.assertIn('width="576"', html)

    def test_news_section_preserves_bottom_image_placement(self):
        response = self.client.post("/api/admin/news", json={
            "title": "Bottom image placement",
            "body": "Introductory copy",
            "sections": [{
                "heading": "Section heading",
                "body": "Section copy",
                "caption": "Section image",
                "image_position": "bottom",
            }],
        })

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.get_json()["sections"][0]["image_position"], "bottom")

    def test_deleting_newsletter_history_does_not_delete_initiating_user(self):
        from backend.models import Contact, NewsletterCampaign, NewsletterCampaignRecipient
        contact = Contact(email="history-recipient@example.com", full_name="History Recipient")
        db.session.add(contact)
        db.session.flush()
        campaign = NewsletterCampaign(
            subject="Saved campaign",
            title="Saved campaign",
            content={"sections": [{"body": "Saved content"}]},
            audience={"contact_ids": [123]},
            initiated_by=self.admin.id,
        )
        db.session.add(campaign)
        db.session.flush()
        recipient = NewsletterCampaignRecipient(
            campaign_id=campaign.id,
            contact_id=contact.id,
            email=contact.email,
            status="accepted",
            attempt_count=1,
            attempts=[{"status": "accepted"}],
        )
        db.session.add(recipient)
        db.session.commit()
        campaign_id = campaign.id
        recipient_id = recipient.id
        admin_id = self.admin.id

        response = self.client.delete(f"/api/admin/newsletters/campaigns/{campaign_id}")

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(db.session.get(NewsletterCampaign, campaign_id))
        self.assertIsNone(db.session.get(NewsletterCampaignRecipient, recipient_id))
        self.assertIsNotNone(db.session.get(User, admin_id))

    def test_newsletter_recipient_results_and_individual_retry(self):
        from backend.models import Contact, NewsletterCampaign, NewsletterCampaignRecipient
        contact = Contact(email="failed-recipient@example.com", full_name="Failed Recipient")
        campaign = NewsletterCampaign(
            subject="Retry campaign",
            title="Retry campaign",
            brand="realmindx",
            sender="news",
            content={"sections": [{"body": "<p>Retry this newsletter</p>"}]},
            audience={"contact_ids": [], "recipient_emails": [contact.email]},
            recipient_count=1,
            failed_count=1,
            status="failed",
            initiated_by=self.admin.id,
        )
        db.session.add_all([contact, campaign])
        db.session.flush()
        recipient = NewsletterCampaignRecipient(
            campaign_id=campaign.id,
            contact_id=contact.id,
            email=contact.email,
            status="failed",
            error_code="provider_rejected",
            error_message="Provider rejected the original attempt.",
            attempt_count=1,
            attempts=[{"status": "failed", "error_code": "provider_rejected"}],
        )
        db.session.add(recipient)
        db.session.commit()

        detail = self.client.get(f"/api/admin/newsletters/campaigns/{campaign.id}/recipients")
        self.assertEqual(detail.status_code, 200)
        self.assertTrue(detail.get_json()["details_available"])
        self.assertEqual(detail.get_json()["recipients"][0]["email"], contact.email)

        retry = self.client.post(
            f"/api/admin/newsletters/campaigns/{campaign.id}/recipients/{recipient.id}/resend"
        )
        self.assertEqual(retry.status_code, 200)
        db.session.refresh(recipient)
        db.session.refresh(campaign)
        self.assertEqual(recipient.status, "mocked")
        self.assertEqual(recipient.attempt_count, 2)
        self.assertEqual(len(recipient.attempts), 2)
        self.assertEqual(campaign.mocked_count, 1)
        self.assertEqual(campaign.failed_count, 0)
        self.assertEqual(campaign.status, "completed")

    def test_newsletter_send_persists_each_recipient_result(self):
        from backend.models import Contact, NewsletterCampaignRecipient
        contact = Contact(email="campaign-recipient@example.com", full_name="Campaign Recipient")
        db.session.add(contact)
        db.session.commit()

        response = self.client.post("/api/admin/newsletters/send", json={
            "subject": "Recipient tracking",
            "title": "Recipient tracking",
            "sections": [{"body": "<p>Tracked delivery</p>"}],
            "contact_ids": [contact.id],
        })

        self.assertEqual(response.status_code, 200)
        campaign_id = response.get_json()["campaign"]["id"]
        recipient = NewsletterCampaignRecipient.query.filter_by(campaign_id=campaign_id).one()
        self.assertEqual(recipient.email, contact.email)
        self.assertEqual(recipient.status, "mocked")
        self.assertEqual(recipient.attempt_count, 1)
        self.assertEqual(len(recipient.attempts), 1)

    def test_resend_all_retries_only_failed_newsletter_recipients(self):
        from backend.models import Contact, NewsletterCampaign, NewsletterCampaignRecipient
        contacts = [
            Contact(email="failed-one@example.com", full_name="Failed One"),
            Contact(email="failed-two@example.com", full_name="Failed Two"),
            Contact(email="already-sent@example.com", full_name="Already Sent"),
        ]
        campaign = NewsletterCampaign(
            subject="Bulk retry campaign",
            title="Bulk retry campaign",
            content={"sections": [{"body": "<p>Retry failed recipients</p>"}]},
            audience={},
            recipient_count=3,
            sent_count=1,
            failed_count=2,
            status="partial",
            initiated_by=self.admin.id,
        )
        db.session.add_all([*contacts, campaign])
        db.session.flush()
        rows = [
            NewsletterCampaignRecipient(campaign_id=campaign.id, contact_id=contacts[0].id, email=contacts[0].email, status="failed", attempt_count=1, attempts=[{"status": "failed"}]),
            NewsletterCampaignRecipient(campaign_id=campaign.id, contact_id=contacts[1].id, email=contacts[1].email, status="rejected", attempt_count=1, attempts=[{"status": "rejected"}]),
            NewsletterCampaignRecipient(campaign_id=campaign.id, contact_id=contacts[2].id, email=contacts[2].email, status="accepted", attempt_count=1, attempts=[{"status": "accepted"}]),
        ]
        db.session.add_all(rows)
        db.session.commit()

        response = self.client.post(f"/api/admin/newsletters/campaigns/{campaign.id}/recipients/resend-failed")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.get_json()["results"]), 2)
        db.session.refresh(campaign)
        self.assertEqual(campaign.mocked_count, 2)
        self.assertEqual(campaign.sent_count, 1)
        self.assertEqual(campaign.failed_count, 0)
        self.assertEqual(campaign.status, "completed")
        self.assertEqual(rows[2].attempt_count, 1)

    def test_deleting_contact_preserves_newsletter_recipient_history(self):
        from backend.models import Contact, NewsletterCampaign, NewsletterCampaignRecipient
        contact = Contact(email="deleted-contact@example.com", full_name="Deleted Contact")
        campaign = NewsletterCampaign(
            subject="Preserved recipient",
            title="Preserved recipient",
            content={"sections": [{"body": "<p>History</p>"}]},
            audience={},
            recipient_count=1,
            sent_count=1,
            status="completed",
        )
        db.session.add_all([contact, campaign])
        db.session.flush()
        recipient = NewsletterCampaignRecipient(
            campaign_id=campaign.id,
            contact_id=contact.id,
            email=contact.email,
            status="accepted",
            attempt_count=1,
            attempts=[{"status": "accepted"}],
        )
        db.session.add(recipient)
        db.session.commit()
        recipient_id = recipient.id

        db.session.delete(contact)
        db.session.commit()

        preserved = db.session.get(NewsletterCampaignRecipient, recipient_id)
        self.assertIsNotNone(preserved)
        self.assertIsNone(preserved.contact_id)
        self.assertEqual(preserved.email, "deleted-contact@example.com")


class NewsletterUnsubscribeEndpointTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(CommunicationTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()

        from backend.models import NewsletterSubscriber
        import secrets
        self.token = secrets.token_urlsafe(32)
        self.subscriber = NewsletterSubscriber(
            email="subscriber@example.com",
            source="site",
            communication_status="marketing_active",
            is_active=True,
            unsubscribe_token=self.token,
        )
        db.session.add(self.subscriber)
        db.session.commit()

        self.client = self.app.test_client()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.context.pop()

    def test_unsubscribe_valid_token(self):
        resp = self.client.get(f"/api/newsletter/unsubscribe?token={self.token}")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data.get("status"), "unsubscribed")
        self.assertIn("unsubscribed", (data.get("message") or "").lower())

    def test_unsubscribe_invalid_token(self):
        resp = self.client.get("/api/newsletter/unsubscribe?token=bogus-token")
        self.assertEqual(resp.status_code, 404)
        data = resp.get_json()
        self.assertIn("invalid", (data.get("error") or "").lower())

    def test_unsubscribe_missing_token(self):
        resp = self.client.get("/api/newsletter/unsubscribe")
        self.assertEqual(resp.status_code, 400)

    def test_unsubscribe_twice_returns_unsubscribed(self):
        resp = self.client.get(f"/api/newsletter/unsubscribe?token={self.token}")
        self.assertEqual(resp.status_code, 200)
        resp2 = self.client.get(f"/api/newsletter/unsubscribe?token={self.token}")
        self.assertEqual(resp2.status_code, 200)
        data2 = resp2.get_json()
        self.assertEqual(data2.get("status"), "unsubscribed")
        self.assertIn("already", (data2.get("message") or "").lower())

    def test_unsubscribe_sets_is_active_false(self):
        self.client.get(f"/api/newsletter/unsubscribe?token={self.token}")
        from backend.models import NewsletterSubscriber
        db.session.expire_all()
        row = NewsletterSubscriber.query.filter_by(email="subscriber@example.com").first()
        self.assertFalse(row.is_active)
        self.assertEqual(row.communication_status, "unsubscribed")


class CommunicationCallerMetadataTests(unittest.TestCase):
    def test_every_application_caller_supplies_attempt_metadata(self):
        tracked = {"send_email", "send_sms", "send_whatsapp_text", "send_whatsapp_otp"}
        service_files = {"email_service.py", "sms_service.py", "whatsapp_service.py"}
        required = {"purpose", "recipient_user_id", "template_name"}
        missing = []

        for path in sorted((SITE_ROOT / "backend").rglob("*.py")):
            tree = ast.parse(path.read_text(encoding="utf-8-sig"), filename=str(path))
            if path.name in service_files:
                continue
            for node in ast.walk(tree):
                if not isinstance(node, ast.Call):
                    continue
                if isinstance(node.func, ast.Name):
                    call_name = node.func.id
                elif isinstance(node.func, ast.Attribute):
                    call_name = node.func.attr
                else:
                    continue
                if call_name not in tracked:
                    continue
                supplied = {keyword.arg for keyword in node.keywords if keyword.arg}
                absent = sorted(required - supplied)
                if absent:
                    missing.append(
                        f"{path.relative_to(SITE_ROOT)}:{node.lineno} "
                        f"{call_name}: {', '.join(absent)}"
                    )

        self.assertEqual(missing, [], "\n".join(missing))


class ReminderDeliveryResultTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(CommunicationTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.context.pop()

    @patch("backend.api.bookshop._send_cart_invoice_email")
    def test_mocked_cart_invoice_reminder_is_not_marked_sent(self, mock_send):
        from backend.api.bookshop import send_due_cart_invoice_reminders
        from backend.models import CartInvoice

        mock_send.return_value = CommunicationResult(
            channel="email",
            purpose="service_reminder",
            provider="mock",
            mode="mock",
            status="mocked",
            template_name="cart_invoice_reminder",
        )
        invoice = CartInvoice(
            invoice_id="INV-REMINDER-MOCK",
            status="emailed",
            emailed_at=datetime.now(timezone.utc) - timedelta(days=4),
            recipients=["recipient@example.com"],
        )
        db.session.add(invoice)
        db.session.commit()

        sent = send_due_cart_invoice_reminders()

        db.session.refresh(invoice)
        self.assertEqual(sent, 0)
        self.assertIsNone(invoice.reminder_3d_sent_at)


if __name__ == "__main__":
    unittest.main()
