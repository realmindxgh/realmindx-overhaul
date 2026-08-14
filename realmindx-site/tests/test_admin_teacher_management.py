import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

SITE_ROOT = Path(__file__).resolve().parents[1]
if str(SITE_ROOT) not in sys.path:
    sys.path.insert(0, str(SITE_ROOT))

from backend import create_app
from backend.config import Config
from backend.extensions import db
from unittest.mock import patch

from backend.models import CommunicationAttempt, Job, JobAlertPreference, JobApplication, Role, TeacherPlacement, UploadedFile, User, UserProfile


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

    def test_teacher_summary_includes_verified_disabled_accounts(self):
        response = self.client.get("/api/admin/users")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["summary"]["total_teachers"], 2)
        self.assertEqual(data["summary"]["active_teachers"], 1)
        self.assertEqual(data["summary"]["disabled_accounts"], 1)
        self.assertEqual(data["summary"]["excluded_internal_accounts"], 1)

    def test_active_teacher_payload_includes_location_subjects_and_curricula_for_filtering(self):
        self.active_teacher.profile.location = "East Legon, Accra"
        self.active_teacher.profile.preferred_locations = "Tema, Oyarifa"
        self.active_teacher.profile.teaching_subject = "Mathematics, Physics"
        self.active_teacher.profile.curriculum_experience = "GES / NaCCA Curriculum, Cambridge International Curriculum"
        db.session.commit()

        response = self.client.get("/api/admin/users")

        self.assertEqual(response.status_code, 200)
        teacher = next(item for item in response.get_json()["items"] if item["id"] == self.active_teacher.id)
        self.assertEqual(teacher["location"], "East Legon, Accra")
        self.assertEqual(teacher["preferred_locations"], "Tema, Oyarifa")
        self.assertEqual(teacher["teaching_subject"], "Mathematics, Physics")
        self.assertEqual(
            teacher["curriculum_experience"],
            "GES / NaCCA Curriculum, Cambridge International Curriculum",
        )

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

    @patch("backend.api.admin.send_email")
    def test_send_incomplete_profile_reminder(self, send_email_mock):
        from backend.communications import CommunicationResult
        send_email_mock.return_value = CommunicationResult(
            channel="email", purpose="service_reminder", provider="mock",
            mode="live", status="accepted",
        )
        response = self.client.post(f"/api/admin/users/{self.active_teacher.id}/profile-reminder", json={})
        self.assertEqual(response.status_code, 200)
        self.assertIn(self.active_teacher.email, response.get_json()["message"])
        self.assertEqual(send_email_mock.call_count, 1)
        message = send_email_mock.call_args.args[0]
        self.assertIn("almost ready", message.subject)
        self.assertIn("almost there", message.html)
        self.assertIn("Finish My Profile", message.html)
        self.assertIn("/login", message.html)
        self.assertIn("Add and verify a phone number", message.html)
        self.assertIn("Add and verify a phone number", message.text)
        self.assertIn("does not automatically submit your profile", message.html)
        self.assertIn("Submit Profile for Review", message.html)
        self.assertIn("does not automatically submit your profile", message.text)
        self.assertIn("https://realmindxgh.com/logo-white.png", message.html)

    def test_automatic_profile_reminder_stages_use_24h_then_7d_then_30d(self):
        from backend.api.admin import _automated_profile_reminder_due

        now = datetime.now(timezone.utc)
        self.active_teacher.created_at = now - timedelta(days=2)
        db.session.commit()

        due = _automated_profile_reminder_due(self.active_teacher, now=now)
        self.assertEqual(due["stage"], 1)
        self.assertEqual(due["template_name"], "profile_completion_reminder_24h")

        db.session.add(CommunicationAttempt(
            channel="email", purpose="service_reminder", recipient_user_id=self.active_teacher.id,
            masked_destination="t***@example.com", template_name="profile_completion_reminder_24h",
            provider="test", mode="live", status="accepted", requested_at=now - timedelta(days=8),
        ))
        db.session.commit()
        due = _automated_profile_reminder_due(self.active_teacher, now=now)
        self.assertEqual(due["stage"], 2)
        self.assertEqual(due["template_name"], "profile_completion_reminder_7d")

        first_attempt = CommunicationAttempt.query.filter_by(
            recipient_user_id=self.active_teacher.id,
            template_name="profile_completion_reminder_24h",
        ).one()
        first_attempt.requested_at = now - timedelta(days=40)
        db.session.add(CommunicationAttempt(
            channel="email", purpose="service_reminder", recipient_user_id=self.active_teacher.id,
            masked_destination="t***@example.com", template_name="profile_completion_reminder_7d",
            provider="test", mode="live", status="accepted", requested_at=now - timedelta(days=31),
        ))
        db.session.commit()
        due = _automated_profile_reminder_due(self.active_teacher, now=now)
        self.assertEqual(due["stage"], 3)
        self.assertEqual(due["template_name"], "profile_completion_reminder_30d")

        db.session.add(CommunicationAttempt(
            channel="email", purpose="service_reminder", recipient_user_id=self.active_teacher.id,
            masked_destination="t***@example.com", template_name="profile_completion_reminder_30d",
            provider="test", mode="live", status="accepted", requested_at=now,
        ))
        db.session.commit()
        self.assertIsNone(_automated_profile_reminder_due(self.active_teacher, now=now))

    @patch("backend.api.admin.send_email")
    def test_send_batch_profile_reminders_includes_phone_verification(self, send_email_mock):
        from backend.communications import CommunicationResult
        send_email_mock.return_value = CommunicationResult(
            channel="email", purpose="service_reminder", provider="mock",
            mode="live", status="accepted",
        )
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
        self.assertEqual(data["accepted"], 3)
        self.assertEqual(send_email_mock.call_count, 3)
        sent_by_email = {call.args[0].to: call.args[0] for call in send_email_mock.call_args_list}
        self.assertIn("complete-no-phone@example.com", sent_by_email)
        phone_email = sent_by_email["complete-no-phone@example.com"]
        self.assertIn("submit it for review", phone_email.subject)
        self.assertIn("not yet been submitted", phone_email.html)
        self.assertIn("Submit Profile for Review", phone_email.html)
        self.assertIn("verify your phone number", phone_email.html)
        self.assertIn("not yet been submitted", phone_email.text)

    @patch("backend.api.admin.send_email")
    def test_complete_unsubmitted_profile_gets_submission_reminder(self, send_email_mock):
        from backend.communications import CommunicationResult

        send_email_mock.return_value = CommunicationResult(
            channel="email", purpose="service_reminder", provider="mock",
            mode="live", status="accepted",
        )
        self.active_teacher.phone = "+233200000999"
        self.active_teacher.phone_verified = True
        profile = self.active_teacher.profile
        profile.location = "Accra"
        profile.teaching_subject = "Mathematics"
        profile.preferred_level = "JHS"
        profile.preferred_employment_type = "Full time"
        profile.curriculum_experience = "GES"
        cv = UploadedFile(
            owner_id=self.active_teacher.id, original_filename="ready-cv.pdf",
            stored_filename="ready-cv.pdf", storage_path="protected/ready-cv.pdf",
            mime_type="application/pdf", size_bytes=100, category="cv",
        )
        cert = UploadedFile(
            owner_id=self.active_teacher.id, original_filename="ready-cert.pdf",
            stored_filename="ready-cert.pdf", storage_path="protected/ready-cert.pdf",
            mime_type="application/pdf", size_bytes=100, category="certificate",
        )
        db.session.add_all([cv, cert])
        db.session.flush()
        profile.cv_file_id = cv.id
        profile.certificate_file_id = cert.id
        profile.profile_status = "complete"
        db.session.commit()

        response = self.client.post(
            f"/api/admin/users/{self.active_teacher.id}/profile-reminder",
            json={},
        )

        self.assertEqual(response.status_code, 200)
        message = send_email_mock.call_args.args[0]
        self.assertIn("submit it for review", message.subject)
        self.assertIn("100% complete", message.html)
        self.assertIn("does not automatically start the review", message.html)
        self.assertIn("Sign In and Submit for Review", message.html)
        self.assertIn("/login", message.html)

    def test_submission_reminders_have_an_independent_24h_7d_30d_sequence(self):
        from backend.api.admin import _automated_profile_reminder_due

        now = datetime.now(timezone.utc)
        profile = self.active_teacher.profile
        self.active_teacher.phone_verified = True
        profile.location = "Accra"
        profile.teaching_subject = "Mathematics"
        profile.preferred_level = "JHS"
        profile.preferred_employment_type = "Full time"
        profile.curriculum_experience = "GES"
        cv = UploadedFile(
            owner_id=self.active_teacher.id, original_filename="sequence-cv.pdf",
            stored_filename="sequence-cv.pdf", storage_path="protected/sequence-cv.pdf",
            mime_type="application/pdf", size_bytes=100, category="cv",
        )
        cert = UploadedFile(
            owner_id=self.active_teacher.id, original_filename="sequence-cert.pdf",
            stored_filename="sequence-cert.pdf", storage_path="protected/sequence-cert.pdf",
            mime_type="application/pdf", size_bytes=100, category="certificate",
        )
        db.session.add_all([cv, cert])
        db.session.flush()
        profile.cv_file_id = cv.id
        profile.certificate_file_id = cert.id
        profile.profile_status = "complete"
        profile.updated_at = now - timedelta(days=2)
        for index, template_name in enumerate((
            "profile_completion_reminder_24h",
            "profile_completion_reminder_7d",
            "profile_completion_reminder_30d",
        )):
            db.session.add(CommunicationAttempt(
                channel="email", purpose="service_reminder",
                recipient_user_id=self.active_teacher.id,
                masked_destination="t***@example.com", template_name=template_name,
                provider="test", mode="live", status="accepted",
                requested_at=now - timedelta(days=60 - index),
            ))
        db.session.commit()

        due = _automated_profile_reminder_due(self.active_teacher, now=now)

        self.assertEqual(due["reminder_kind"], "submission")
        self.assertEqual(due["stage"], 1)
        self.assertEqual(due["template_name"], "profile_submission_reminder_24h")

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
