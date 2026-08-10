import re
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from sqlalchemy.exc import IntegrityError

SITE_ROOT = Path(__file__).resolve().parents[1]
if str(SITE_ROOT) not in sys.path:
    sys.path.insert(0, str(SITE_ROOT))

from backend import create_app
from backend.communications import CommunicationResult
from backend.config import Config
from backend.extensions import db
from backend.models import Role, User, UserProfile
from backend.teacher_ids import generate_application_id


class SignupTestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    SECRET_KEY = "signup-tests"
    BASE_URL = "http://localhost"
    BOOKSHOP_URL = "http://bookshop.localhost"
    CORS_ORIGINS = ["http://localhost", "http://bookshop.localhost"]
    RATELIMIT_ENABLED = False
    WTF_CSRF_ENABLED = False
    TURNSTILE_SECRET_KEY = ""


SIGNUP_PAYLOAD = {
    "email": "teacher-test@example.com",
    "password": "StrongPass1!",
    "first_name": "Test",
    "last_name": "Teacher",
    "phone": "233501234567",
    "accepted_terms": True,
    "surface": "teacher",
}


class SignupTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(SignupTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        db.session.execute(db.text("PRAGMA foreign_keys = ON"))
        self._seed_role()
        self.client = self.app.test_client()

    def _seed_role(self):
        role = Role(name="user", description="Teacher")
        db.session.add(role)
        db.session.commit()

    def tearDown(self):
        db.session.remove()
        db.session.execute(db.text("PRAGMA foreign_keys = OFF"))
        db.session.commit()
        db.drop_all()
        self.context.pop()

    # -- signup assigns an Application ID --

    def test_signup_assigns_application_id(self):
        resp = self.client.post("/api/auth/signup", json=SIGNUP_PAYLOAD)
        self.assertEqual(resp.status_code, 201)
        data = resp.get_json()
        self.assertIsNotNone(data["user"]["application_id"])
        self.assertRegex(data["user"]["application_id"], r"^RMX-APP-\d{4}-\d{6}$")

    def test_application_id_is_persisted(self):
        resp = self.client.post("/api/auth/signup", json=SIGNUP_PAYLOAD)
        self.assertEqual(resp.status_code, 201)
        user_id = resp.get_json()["user"]["id"]
        user = db.session.get(User, user_id)
        self.assertIsNotNone(user.application_id)
        self.assertRegex(user.application_id, r"^RMX-APP-\d{4}-\d{6}$")

    # -- Application IDs are unique --

    def test_application_ids_are_unique(self):
        ids = set()
        for i in range(5):
            payload = {**SIGNUP_PAYLOAD, "email": f"teacher{i}@example.com"}
            resp = self.client.post("/api/auth/signup", json=payload)
            self.assertEqual(resp.status_code, 201)
            ids.add(resp.get_json()["user"]["application_id"])
        self.assertEqual(len(ids), 5)

    # -- sequence increments correctly --

    def test_application_id_sequence_increments(self):
        resp1 = self.client.post("/api/auth/signup", json={**SIGNUP_PAYLOAD, "email": "t1@example.com"})
        resp2 = self.client.post("/api/auth/signup", json={**SIGNUP_PAYLOAD, "email": "t2@example.com"})
        self.assertEqual(resp1.status_code, 201)
        self.assertEqual(resp2.status_code, 201)
        seq1 = int(resp1.get_json()["user"]["application_id"].split("-")[-1])
        seq2 = int(resp2.get_json()["user"]["application_id"].split("-")[-1])
        self.assertEqual(seq2, seq1 + 1)

    # -- duplicate email behaviour unchanged --

    def test_duplicate_email_returns_409(self):
        self.client.post("/api/auth/signup", json=SIGNUP_PAYLOAD)
        resp = self.client.post("/api/auth/signup", json=SIGNUP_PAYLOAD)
        self.assertEqual(resp.status_code, 409)
        self.assertIn("already exists", resp.get_json()["error"])

    # -- password validation unchanged --

    def test_short_password_rejected(self):
        payload = {**SIGNUP_PAYLOAD, "password": "short"}
        resp = self.client.post("/api/auth/signup", json=payload)
        self.assertEqual(resp.status_code, 400)

    # -- missing first name rejected --

    def test_missing_first_name_rejected(self):
        payload = {**SIGNUP_PAYLOAD, "first_name": ""}
        resp = self.client.post("/api/auth/signup", json=payload)
        self.assertEqual(resp.status_code, 400)

    # -- serializer returns application_id --

    def test_serializer_includes_application_id(self):
        resp = self.client.post("/api/auth/signup", json=SIGNUP_PAYLOAD)
        data = resp.get_json()
        self.assertIn("application_id", data["user"])

    def test_serializer_does_not_expose_teacher_id(self):
        resp = self.client.post("/api/auth/signup", json=SIGNUP_PAYLOAD)
        data = resp.get_json()
        self.assertIn("teacher_id", data["user"])
        self.assertIsNone(data["user"]["teacher_id"])

    # -- existing teacher users receive the required application ID --

    def test_existing_teacher_without_application_id_is_backfilled_on_login(self):
        role = Role.query.filter_by(name="user").first()
        user = User(
            email="old@example.com",
            first_name="Old",
            last_name="User",
            role=role,
            is_active=True,
            is_verified=True,
            application_id=None,
        )
        user.set_password("OldPass123!")
        db.session.add(user)
        db.session.flush()
        db.session.add(UserProfile(user_id=user.id))
        db.session.commit()

        self.client.post("/api/auth/login", json={"email": "old@example.com", "password": "OldPass123!"})
        resp = self.client.get("/api/auth/me")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIn("application_id", data["user"])
        self.assertRegex(data["user"]["application_id"], r"^RMX-APP-\d{4}-\d{6}$")
        self.assertEqual(db.session.get(User, user.id).application_id, data["user"]["application_id"])

    # -- signup still works for bookshop users (non-teacher) --

    def test_bookshop_signup_gets_application_id(self):
        payload = {**SIGNUP_PAYLOAD, "email": "bookshop@example.com", "surface": "bookshop"}
        resp = self.client.post("/api/auth/signup", json=payload)
        self.assertEqual(resp.status_code, 201)
        data = resp.get_json()
        self.assertIsNotNone(data["user"]["application_id"])

    # -- signup without phone still works --

    def test_signup_without_phone_succeeds(self):
        payload = {k: v for k, v in SIGNUP_PAYLOAD.items() if k != "phone"}
        resp = self.client.post("/api/auth/signup", json=payload)
        self.assertEqual(resp.status_code, 201)
        self.assertIsNotNone(resp.get_json()["user"]["application_id"])

    # -- signup without terms rejected --

    def test_missing_terms_rejected(self):
        payload = {**SIGNUP_PAYLOAD, "accepted_terms": False}
        resp = self.client.post("/api/auth/signup", json=payload)
        self.assertEqual(resp.status_code, 400)


class SignupRollbackTests(unittest.TestCase):
    """Tests that signup rolls back cleanly when application_id generation fails."""

    def setUp(self):
        self.app = create_app(SignupTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        db.session.execute(db.text("PRAGMA foreign_keys = ON"))
        self._seed_role()
        self.client = self.app.test_client()

    def _seed_role(self):
        role = Role(name="user", description="Teacher")
        db.session.add(role)
        db.session.commit()

    def tearDown(self):
        db.session.remove()
        db.session.execute(db.text("PRAGMA foreign_keys = OFF"))
        db.session.commit()
        db.drop_all()
        self.context.pop()

    @patch("backend.api.auth.generate_application_id", side_effect=IntegrityError("simulated", "orig", "stmt"))
    def test_signup_rolls_back_on_integrity_error(self, _mock):
        resp = self.client.post("/api/auth/signup", json=SIGNUP_PAYLOAD)
        self.assertEqual(resp.status_code, 500)
        user_count = User.query.filter_by(email=SIGNUP_PAYLOAD["email"]).count()
        self.assertEqual(user_count, 0)

    @patch("backend.api.auth.generate_application_id", side_effect=Exception("unexpected"))
    def test_signup_rolls_back_on_arbitrary_error(self, _mock):
        resp = self.client.post("/api/auth/signup", json=SIGNUP_PAYLOAD)
        self.assertEqual(resp.status_code, 500)
        user_count = User.query.filter_by(email=SIGNUP_PAYLOAD["email"]).count()
        self.assertEqual(user_count, 0)


class SignupNoApplicationIdRegressionTests(unittest.TestCase):
    """Verify existing behavioural contracts are unchanged."""

    def setUp(self):
        self.app = create_app(SignupTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        db.session.execute(db.text("PRAGMA foreign_keys = ON"))
        self._seed_role()
        self.client = self.app.test_client()

    def _seed_role(self):
        role = Role(name="user", description="Teacher")
        db.session.add(role)
        db.session.commit()

    def tearDown(self):
        db.session.remove()
        db.session.execute(db.text("PRAGMA foreign_keys = OFF"))
        db.session.commit()
        db.drop_all()
        self.context.pop()

    def test_otp_sent_on_signup(self):
        with patch("backend.api.auth._send_verification_otp") as mock_otp:
            mock_otp.return_value = CommunicationResult(
                channel="email",
                purpose="security",
                provider="mock",
                mode="mock",
                status="mocked",
            )
            resp = self.client.post("/api/auth/signup", json=SIGNUP_PAYLOAD)
            self.assertEqual(resp.status_code, 201)
            mock_otp.assert_called_once()

    def test_audit_logged_on_signup(self):
        with patch("backend.api.auth.audit") as mock_audit:
            resp = self.client.post("/api/auth/signup", json=SIGNUP_PAYLOAD)
            self.assertEqual(resp.status_code, 201)
            mock_audit.assert_called_once_with("user_signup", "user", mock_audit.call_args[0][2], {"email": SIGNUP_PAYLOAD["email"]})

    def test_user_profile_created(self):
        resp = self.client.post("/api/auth/signup", json=SIGNUP_PAYLOAD)
        self.assertEqual(resp.status_code, 201)
        user_id = resp.get_json()["user"]["id"]
        profile = UserProfile.query.filter_by(user_id=user_id).first()
        self.assertIsNotNone(profile)
        self.assertEqual(profile.profile_status, "incomplete")

    def test_role_assigned(self):
        resp = self.client.post("/api/auth/signup", json=SIGNUP_PAYLOAD)
        self.assertEqual(resp.status_code, 201)
        data = resp.get_json()
        self.assertEqual(data["user"]["role"], "user")

    def test_terms_accepted_at_set(self):
        resp = self.client.post("/api/auth/signup", json=SIGNUP_PAYLOAD)
        self.assertEqual(resp.status_code, 201)
        data = resp.get_json()
        self.assertIsNotNone(data["user"]["terms_accepted_at"])

    def test_response_has_requires_verification(self):
        resp = self.client.post("/api/auth/signup", json=SIGNUP_PAYLOAD)
        self.assertEqual(resp.status_code, 201)
        data = resp.get_json()
        self.assertTrue(data["requires_verification"])


if __name__ == "__main__":
    unittest.main()
