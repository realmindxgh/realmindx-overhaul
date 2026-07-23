import sys
import unittest
from pathlib import Path

SITE_ROOT = Path(__file__).resolve().parents[1]
if str(SITE_ROOT) not in sys.path:
    sys.path.insert(0, str(SITE_ROOT))

from backend import create_app
from backend.config import Config
from backend.extensions import db
from unittest.mock import patch

from backend.models import Job, JobAlertPreference, JobApplication, Role, TeacherPlacement, UploadedFile, User, UserProfile


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
        db.session.execute(db.text("PRAGMA foreign_keys = ON"))

        admin_role = Role(name="admin", description="Admin")
        teacher_role = Role(name="user", description="Teacher")
        admin = User(email="admin@example.com", first_name="Admin", last_name="User", role=admin_role, is_active=True, is_verified=True)
        admin.set_password("AdminPassword123!")
        active_teacher = User(email="teacher-active@example.com", first_name="Active", last_name="Teacher", role=teacher_role, is_active=True, is_verified=True)
        active_teacher.set_password("TeacherPassword1")
        inactive_teacher = User(email="teacher-inactive@example.com", first_name="Inactive", last_name="Teacher", role=teacher_role, is_active=False, is_verified=True)
        inactive_teacher.set_password("TeacherPassword1")
        unverified_teacher = User(email="teacher-unverified@example.com", first_name="Unverified", last_name="Teacher", role=teacher_role, is_active=True, is_verified=False)
        unverified_teacher.set_password("TeacherPassword1")
        db.session.add_all([admin_role, teacher_role, admin, active_teacher, inactive_teacher, unverified_teacher])
        db.session.commit()
        db.session.add_all([
            UserProfile(user_id=active_teacher.id),
            UserProfile(user_id=inactive_teacher.id),
            UserProfile(user_id=unverified_teacher.id),
        ])
        db.session.commit()
        # Ensure the active teacher has a job application to reproduce the delete crash.
        job = Job(title="Test Job", organisation="Test Org", location="Test", description="Test description", status="pending")
        db.session.add(job)
        db.session.flush()
        db.session.add(JobApplication(user_id=active_teacher.id, job_id=job.id))
        db.session.commit()

        self.admin = admin
        self.active_teacher = active_teacher
        self.unverified_teacher = unverified_teacher
        self.client = self.app.test_client()
        response = self.client.post("/api/auth/login", json={"email": admin.email, "password": "AdminPassword123!"})
        self.assertEqual(response.status_code, 200)

    def tearDown(self):
        db.session.remove()
        db.session.execute(db.text("PRAGMA foreign_keys = OFF"))
        db.session.commit()
        db.drop_all()
        self.context.pop()

    def test_dashboard_counts_only_active_teachers(self):
        response = self.client.get("/api/admin/dashboard")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertIn("summary", data)
        self.assertEqual(data["summary"]["total_users"], 1)

    def test_unverified_teacher_is_excluded_from_active_teachers(self):
        response = self.client.get("/api/admin/users")
        self.assertEqual(response.status_code, 200)
        user_ids = [item["id"] for item in response.get_json()["items"]]
        self.assertIn(self.active_teacher.id, user_ids)
        self.assertNotIn(self.unverified_teacher.id, user_ids)

    def test_delete_teacher_account(self):
        db.session.add(JobAlertPreference(user_id=self.active_teacher.id, subject="Mathematics", location="Test"))
        db.session.commit()
        response = self.client.delete(f"/api/admin/users/{self.active_teacher.id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json().get("message"), "Teacher account deleted.")
        self.assertIsNone(User.query.filter_by(id=self.active_teacher.id).first())
        self.assertEqual(JobApplication.query.filter_by(user_id=self.active_teacher.id).count(), 0)
        self.assertEqual(JobAlertPreference.query.filter_by(user_id=self.active_teacher.id).count(), 0)
        users_response = self.client.get("/api/admin/users")
        self.assertEqual(users_response.status_code, 200)
        user_ids = [item["id"] for item in users_response.get_json().get("items", [])]
        self.assertNotIn(self.active_teacher.id, user_ids)

    def test_bookshop_customer_uses_shared_user_but_not_teacher_view(self):
        customer = User(
            email="customer@example.com",
            first_name="Bookshop",
            last_name="Customer",
            role=Role.query.filter_by(name="user").one(),
            is_active=True,
            is_verified=True,
            teacher_service_enabled=False,
            bookshop_service_enabled=True,
        )
        customer.set_password("CustomerPassword1")
        db.session.add(customer)
        db.session.commit()

        teachers_response = self.client.get("/api/admin/users")
        teacher_ids = [item["id"] for item in teachers_response.get_json()["items"]]
        self.assertNotIn(customer.id, teacher_ids)

        customers_response = self.client.get("/api/admin/bookshop-accounts")
        self.assertEqual(customers_response.status_code, 200)
        customer_rows = customers_response.get_json()["items"]
        self.assertIn(customer.id, [item["id"] for item in customer_rows])

    @patch("backend.api.admin.send_email", return_value={"provider": "test", "status": "sent"})
    def test_send_incomplete_profile_reminder(self, send_email_mock):
        response = self.client.post(f"/api/admin/users/{self.active_teacher.id}/profile-reminder", json={})
        self.assertEqual(response.status_code, 200)
        self.assertIn(self.active_teacher.email, response.get_json()["message"])
        self.assertEqual(send_email_mock.call_count, 1)
        message = send_email_mock.call_args.args[0]
        self.assertIn("almost ready", message.subject)
        self.assertIn("almost there", message.html)
        self.assertIn("Finish My Profile", message.html)
        self.assertIn("Verify your phone number", message.html)
        self.assertIn("Verify your phone number", message.text)
        self.assertIn("https://realmindxgh.com/logo-white.png", message.html)

    @patch("backend.api.admin.send_email", return_value={"provider": "test", "status": "sent"})
    def test_send_batch_profile_reminders_includes_phone_verification(self, send_email_mock):
        complete_no_phone = User(
            email="complete-no-phone@example.com",
            first_name="Complete",
            last_name="Teacher",
            role=Role.query.filter_by(name="user").one(),
            is_active=True,
            is_verified=True,
            teacher_service_enabled=True,
            phone="+233200000111",
            phone_verified=False,
        )
        complete_no_phone.set_password("TeacherPassword1")
        db.session.add(complete_no_phone)
        db.session.flush()
        cv = UploadedFile(
            owner_id=complete_no_phone.id,
            original_filename="cv.pdf",
            stored_filename="cv.pdf",
            storage_path="protected/cv.pdf",
            mime_type="application/pdf",
            size_bytes=100,
            category="cv",
        )
        cert = UploadedFile(
            owner_id=complete_no_phone.id,
            original_filename="certificate.pdf",
            stored_filename="certificate.pdf",
            storage_path="protected/certificate.pdf",
            mime_type="application/pdf",
            size_bytes=100,
            category="certificate",
        )
        db.session.add_all([cv, cert])
        db.session.flush()
        db.session.add(UserProfile(
            user_id=complete_no_phone.id,
            location="Accra",
            teaching_subject="Mathematics",
            preferred_level="JHS",
            preferred_employment_type="Full time",
            curriculum_experience="GES",
            cv_file_id=cv.id,
            certificate_file_id=cert.id,
        ))
        db.session.commit()

        response = self.client.post("/api/admin/users/profile-reminders", json={})

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["sent_count"], 2)
        self.assertEqual(send_email_mock.call_count, 2)
        sent_by_email = {call.args[0].to: call.args[0] for call in send_email_mock.call_args_list}
        self.assertIn("complete-no-phone@example.com", sent_by_email)
        phone_email = sent_by_email["complete-no-phone@example.com"]
        self.assertIn("Verify your phone number", phone_email.html)
        self.assertIn("Verify your phone number", phone_email.text)

    def test_teacher_with_placement_history_must_be_disabled_instead(self):
        application = JobApplication.query.filter_by(user_id=self.active_teacher.id).one()
        db.session.add(TeacherPlacement(
            user_id=self.active_teacher.id,
            application_id=application.id,
            job_id=application.job_id,
            school_name="History Test School",
            job_title="Placed Teacher",
        ))
        db.session.commit()

        response = self.client.delete(f"/api/admin/users/{self.active_teacher.id}")

        self.assertEqual(response.status_code, 409)
        self.assertIsNotNone(User.query.filter_by(id=self.active_teacher.id).first())


if __name__ == "__main__":
    unittest.main()
