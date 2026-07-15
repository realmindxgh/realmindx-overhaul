import sys
import unittest
from pathlib import Path


SITE_ROOT = Path(__file__).resolve().parents[1]
if str(SITE_ROOT) not in sys.path:
    sys.path.insert(0, str(SITE_ROOT))

from backend import create_app
from backend.config import Config
from backend.extensions import db
from backend.email_service import _email_contact_settings, app_email_shell, bookshop_email_shell
from backend.models import Role, SiteSetting, User


class SiteSettingsTestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    SECRET_KEY = "site-settings-tests"
    BASE_URL = "http://localhost"
    BOOKSHOP_URL = "http://bookshop.localhost"
    CORS_ORIGINS = ["http://localhost", "http://bookshop.localhost"]
    RATELIMIT_ENABLED = False


class SiteSettingsTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(SiteSettingsTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        role = Role(name="admin", description="Admin")
        admin = User(email="settings-admin@example.com", first_name="Settings", role=role, is_active=True, is_verified=True)
        admin.set_password("AdminPassword123!")
        db.session.add_all([role, admin])
        db.session.commit()
        self.client = self.app.test_client()
        response = self.client.post("/api/auth/login", json={"email": admin.email, "password": "AdminPassword123!"})
        self.assertEqual(response.status_code, 200)

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.context.pop()

    def test_public_settings_are_uncached_and_deleted_values_stay_absent(self):
        db.session.add(SiteSetting(key="contact_phone_1", value="+233 20 000 0000", public=True))
        db.session.commit()

        response = self.client.get("/api/settings")
        self.assertEqual(response.status_code, 200)
        self.assertIn("no-store", response.headers["Cache-Control"])
        self.assertEqual(response.get_json()["settings"]["contact_phone_1"], "+233 20 000 0000")

        db.session.query(SiteSetting).delete()
        db.session.commit()
        self.assertEqual(self.client.get("/api/settings").get_json()["settings"], {})

    def test_shared_and_site_specific_settings_are_independent(self):
        shared = self.client.put("/api/admin/settings/contact_phone_1", json={
            "key": "contact_phone_1", "site_scope": "all", "value": "Shared phone", "public": True,
        })
        bookshop = self.client.put("/api/admin/settings/bookshop__contact_phone_1", json={
            "key": "contact_phone_1", "site_scope": "bookshop", "value": "Bookshop phone", "public": True,
        })
        main = self.client.put("/api/admin/settings/main__working_hours_weekday", json={
            "key": "working_hours_weekday", "site_scope": "main", "value": "Main hours", "public": True,
        })
        self.assertEqual((shared.status_code, bookshop.status_code, main.status_code), (200, 200, 200))

        settings = self.client.get("/api/settings").get_json()["settings"]
        self.assertEqual(settings["contact_phone_1"], "Shared phone")
        self.assertEqual(settings["bookshop__contact_phone_1"], "Bookshop phone")
        self.assertEqual(settings["main__working_hours_weekday"], "Main hours")

        rows = self.client.get("/api/admin/settings").get_json()["items"]
        scopes = {(row["key"], row["site_scope"]) for row in rows}
        self.assertIn(("contact_phone_1", "all"), scopes)
        self.assertIn(("contact_phone_1", "bookshop"), scopes)
        self.assertIn(("working_hours_weekday", "main"), scopes)

        deleted = self.client.delete("/api/admin/settings/bookshop__contact_phone_1")
        self.assertEqual(deleted.status_code, 200)
        remaining = self.client.get("/api/settings").get_json()["settings"]
        self.assertEqual(remaining["contact_phone_1"], "Shared phone")
        self.assertNotIn("bookshop__contact_phone_1", remaining)

    def test_duplicate_detail_for_same_scope_is_rejected(self):
        db.session.add(SiteSetting(key="bookshop__contact_email", value="one@example.com", public=True))
        db.session.commit()
        response = self.client.put("/api/admin/settings/contact_email", json={
            "key": "contact_email", "site_scope": "bookshop", "value": "two@example.com", "public": True,
        })
        self.assertEqual(response.status_code, 409)

    def test_email_shell_contacts_follow_scope_and_do_not_restore_deleted_values(self):
        db.session.add_all([
            SiteSetting(key="contact_email", value="shared@example.com", public=True),
            SiteSetting(key="bookshop__contact_email", value="shop@example.com", public=True),
            SiteSetting(key="main__contact_phone_1", value="Main phone", public=True),
        ])
        db.session.commit()

        self.assertEqual(_email_contact_settings("main")["email"], "shared@example.com")
        self.assertEqual(_email_contact_settings("main")["phone"], "Main phone")
        self.assertEqual(_email_contact_settings("bookshop")["email"], "shop@example.com")
        self.assertEqual(_email_contact_settings("bookshop")["phone"], "")

        SiteSetting.query.filter_by(key="bookshop__contact_email").delete()
        SiteSetting.query.filter_by(key="contact_email").delete()
        db.session.commit()
        self.assertEqual(_email_contact_settings("bookshop")["email"], "")

    def test_email_shells_use_public_logo_assets_in_local_environments(self):
        main_html = app_email_shell("Main test", "<p>Body</p>")
        bookshop_html = bookshop_email_shell("Shop test", "<p>Body</p>")

        self.assertIn('src="https://realmindxgh.com/logo-white.png"', main_html)
        self.assertIn('src="https://bookshop.realmindxgh.com/bookshop-logo.png"', bookshop_html)
        self.assertNotIn('src="http://localhost/logo-white.png"', main_html)


if __name__ == "__main__":
    unittest.main()
