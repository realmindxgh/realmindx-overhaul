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


if __name__ == "__main__":
    unittest.main()
