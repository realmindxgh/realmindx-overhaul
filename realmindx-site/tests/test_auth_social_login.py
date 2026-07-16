import sys
import unittest
from pathlib import Path

SITE_ROOT = Path(__file__).resolve().parents[1]
if str(SITE_ROOT) not in sys.path:
    sys.path.insert(0, str(SITE_ROOT))

from backend import create_app
from backend.config import Config
from backend.extensions import db
from backend.models import AuthIdentity, Role, User


class AuthSocialLoginTestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    SECRET_KEY = "auth-social-login-tests"
    CORS_ORIGINS = ["http://localhost"]
    RATELIMIT_ENABLED = False


class AuthSocialLoginTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(AuthSocialLoginTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        self.client = self.app.test_client()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.context.pop()

    def test_social_account_password_attempt_returns_provider_hint(self):
        role = Role(name="user", description="Public account")
        user = User(
            email="social@example.com",
            first_name="Social",
            role=role,
            is_active=True,
            is_verified=True,
        )
        user.set_password("random-oauth-placeholder", enable_login=False)
        db.session.add_all([role, user])
        db.session.flush()
        db.session.add(AuthIdentity(
            user_id=user.id,
            provider="google",
            provider_user_id="google-123",
            email=user.email,
        ))
        db.session.commit()

        response = self.client.post(
            "/api/auth/login",
            json={"email": "social@example.com", "password": "Password123!", "surface": "teacher"},
        )

        self.assertEqual(response.status_code, 401)
        data = response.get_json()
        self.assertEqual(data["code"], "social_login_required")
        self.assertEqual(data["reason"], "password_not_set")
        self.assertEqual(data["providers"], ["google"])
        self.assertTrue(data["password_setup_available"])
        self.assertIn("Google", data["error"])
        db.session.expire_all()
        self.assertEqual(User.query.filter_by(email="social@example.com").one().failed_login_count, 0)

    def test_wrong_password_on_linked_social_account_is_helpful(self):
        role = Role(name="user", description="Public account")
        user = User(
            email="linked@example.com",
            first_name="Linked",
            role=role,
            is_active=True,
            is_verified=True,
        )
        user.set_password("RealPassword123!")
        db.session.add_all([role, user])
        db.session.flush()
        db.session.add(AuthIdentity(
            user_id=user.id,
            provider="facebook",
            provider_user_id="facebook-123",
            email=user.email,
        ))
        db.session.commit()

        response = self.client.post(
            "/api/auth/login",
            json={"email": "linked@example.com", "password": "WrongPassword123!", "surface": "teacher"},
        )

        self.assertEqual(response.status_code, 401)
        data = response.get_json()
        self.assertEqual(data["code"], "social_login_required")
        self.assertEqual(data["reason"], "password_login_failed_social_account")
        self.assertEqual(data["providers"], ["facebook"])
        self.assertIn("Facebook", data["error"])


if __name__ == "__main__":
    unittest.main()
