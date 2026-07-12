import sys
import unittest
from pathlib import Path


SITE_ROOT = Path(__file__).resolve().parents[1]
if str(SITE_ROOT) not in sys.path:
    sys.path.insert(0, str(SITE_ROOT))

from backend import create_app
from backend.config import Config
from backend.extensions import db
from backend.models import Resource, Role, User


class ResourceTestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    SECRET_KEY = "resource-tests"
    BASE_URL = "http://localhost"
    BOOKSHOP_URL = "http://localhost/bookshop"
    CORS_ORIGINS = ["http://localhost"]
    RATELIMIT_ENABLED = False


class ResourceLibraryTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(ResourceTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        role = Role(name="admin", description="Admin")
        self.admin = User(email="resources-admin@example.com", first_name="Resource", role=role, is_active=True, is_verified=True)
        self.admin.set_password("AdminPassword123!")
        db.session.add_all([role, self.admin])
        db.session.commit()
        self.client = self.app.test_client()
        response = self.client.post("/api/auth/login", json={"email": self.admin.email, "password": "AdminPassword123!"})
        self.assertEqual(response.status_code, 200)

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.context.pop()

    def test_quick_create_and_optional_metadata(self):
        response = self.client.post("/api/admin/resources", json={
            "title": "Mathematics Syllabus for SHS",
            "category": "Curriculum and Syllabi",
            "external_url": "https://example.edu/math-syllabus.pdf",
            "status": "published",
            "subject": "Mathematics",
            "level": "SHS",
            "tags": "math, syllabus, wassce",
            "source": "Ghana Education Service",
            "publication_year": 2026,
        })
        self.assertEqual(response.status_code, 201)
        public = self.client.get("/api/resources").get_json()["items"]
        self.assertEqual(len(public), 1)
        self.assertEqual(public[0]["category"], "Curriculum and Syllabi")
        self.assertEqual(public[0]["subject"], "Mathematics")
        self.assertEqual(public[0]["publication_year"], 2026)

    def test_visibility_and_linked_only_rules(self):
        db.session.add_all([
            Resource(title="Public Policy", category="Official Policies", external_url="https://example.edu/policy", is_published=True, copyright_status="Official public document"),
            Resource(title="Linked Syllabus", category="Curriculum and Syllabi", external_url="https://example.edu/syllabus", is_published=True, copyright_status="Linked only"),
            Resource(title="Private Notes", category="Research and Reports", external_url="https://example.edu/private", is_published=True, copyright_status="Internal/private"),
            Resource(title="Draft Guide", category="Teacher Resources", external_url="https://example.edu/draft", is_published=False),
            Resource(title="Do Not Publish", category="Teacher Resources", external_url="https://example.edu/no", is_published=True, copyright_status="Do not publish"),
        ])
        db.session.commit()
        items = self.client.get("/api/resources").get_json()["items"]
        self.assertEqual({item["title"] for item in items}, {"Public Policy", "Linked Syllabus"})
        linked = next(item for item in items if item["title"] == "Linked Syllabus")
        self.assertEqual(linked["url"], "https://example.edu/syllabus")

    def test_required_fields_and_valid_date(self):
        missing_category = self.client.post("/api/admin/resources", json={"title": "Guide", "external_url": "https://example.edu/guide"})
        self.assertEqual(missing_category.status_code, 400)
        missing_file = self.client.post("/api/admin/resources", json={"title": "Guide", "category": "Teacher Resources"})
        self.assertEqual(missing_file.status_code, 400)
        invalid_date = self.client.post("/api/admin/resources", json={"title": "Guide", "category": "Teacher Resources", "external_url": "https://example.edu/guide", "last_verified_at": "not-a-date"})
        self.assertEqual(invalid_date.status_code, 400)


if __name__ == "__main__":
    unittest.main()
