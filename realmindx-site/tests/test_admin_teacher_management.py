import sys
import unittest
from pathlib import Path

SITE_ROOT = Path(__file__).resolve().parents[1]
if str(SITE_ROOT) not in sys.path:
    sys.path.insert(0, str(SITE_ROOT))

from backend import create_app
from backend.config import Config
from backend.extensions import db
from backend.models import Role, User, UserProfile


class AdminTeacherManagementTestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    SECRET_KEY = "admin-teacher-tests"
    BASE_URL = "http://localhost"
    BOOKSHOP_URL = "http://bookshop.localhost"
    CORS_ORIGINS = ["http://localhost", "http://bookshop.localhost"]
    RATELIMIT_ENABLED = False


class AdminTeacherManagementTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(AdminTeacherManagementTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()

        admin_role = Role(name="admin", description="Admin")
        teacher_role = Role(name="user", description="Teacher")
        admin = User(email="admin@example.com", first_name="Admin", last_name="User", role=admin_role, is_active=True, is_verified=True)
        admin.set_password("AdminPassword123!")
        active_teacher = User(email="teacher-active@example.com", first_name="Active", last_name="Teacher", role=teacher_role, is_active=True, is_verified=True)
        active_teacher.set_password("TeacherPassword1")
        inactive_teacher = User(email="teacher-inactive@example.com", first_name="Inactive", last_name="Teacher", role=teacher_role, is_active=False, is_verified=True)
        inactive_teacher.set_password("TeacherPassword1")
        db.session.add_all([admin_role, teacher_role, admin, active_teacher, inactive_teacher])
        db.session.commit()
        db.session.add_all([
            UserProfile(user_id=active_teacher.id),
            UserProfile(user_id=inactive_teacher.id),
        ])
        db.session.commit()

        self.admin = admin
        self.active_teacher = active_teacher
        self.client = self.app.test_client()
        response = self.client.post("/api/auth/login", json={"email": admin.email, "password": "AdminPassword123!"})
        self.assertEqual(response.status_code, 200)

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.context.pop()

    def test_dashboard_counts_only_active_teachers(self):
        response = self.client.get("/api/admin/dashboard")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertIn("summary", data)
        self.assertEqual(data["summary"]["total_users"], 1)

    def test_delete_teacher_account(self):
        response = self.client.delete(f"/api/admin/users/{self.active_teacher.id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json().get("message"), "Teacher account deleted.")
        self.assertIsNone(User.query.filter_by(id=self.active_teacher.id).first())
        users_response = self.client.get("/api/admin/users")
        self.assertEqual(users_response.status_code, 200)
        user_ids = [item["id"] for item in users_response.get_json().get("items", [])]
        self.assertNotIn(self.active_teacher.id, user_ids)


if __name__ == "__main__":
    unittest.main()
