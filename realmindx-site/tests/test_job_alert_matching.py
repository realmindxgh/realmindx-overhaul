import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

SITE_ROOT = Path(__file__).resolve().parents[1]
if str(SITE_ROOT) not in sys.path:
    sys.path.insert(0, str(SITE_ROOT))

from backend import create_app
from backend.api.admin import _matches_job_alert, dispatch_job_alerts, dispatch_job_notifications
from backend.cli import delivery_zone_seed_items
from backend.config import Config
from backend.extensions import db
from backend.models import CommunicationAttempt, DeliveryZone, Job, JobAlertPreference, Role, UploadedFile, User, UserProfile


class JobAlertTestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    SECRET_KEY = "job-alert-tests"
    BASE_URL = "http://localhost"
    RATELIMIT_ENABLED = False


class JobAlertMatchingTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(JobAlertTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        role = Role(name="user", description="Teacher")
        zone = DeliveryZone(name="Adenta", is_active=True)
        db.session.add_all([role, zone])
        db.session.flush()
        self.zone = zone
        self.job = Job(
            title="Mathematics Teacher", organisation="School", location=zone.name,
            delivery_zone_id=zone.id, subject="Mathematics",
            level="Junior High / Lower Secondary", curriculum="GES / NaCCA Curriculum",
            employment_type="Full Time", preferred_sex="any", preferred_age_range="any",
            description="Description", status="published",
        )
        db.session.add(self.job)
        self.role = role
        db.session.commit()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.context.pop()

    def add_teacher(self, email, *, complete=True, subject="Mathematics", level="Junior High / Lower Secondary"):
        user = User(email=email, first_name="Test", last_name="Teacher", role=self.role,
                    phone="+233200000000", phone_verified=complete, is_active=True, is_verified=True)
        user.set_password("TeacherPassword1")
        db.session.add(user)
        db.session.flush()
        cv = UploadedFile(owner_id=user.id, original_filename="cv.pdf", stored_filename=f"{user.id}-cv.pdf",
                          storage_path="/tmp/cv.pdf", mime_type="application/pdf", size_bytes=10,
                          category="cv", visibility="protected")
        cert = UploadedFile(owner_id=user.id, original_filename="cert.pdf", stored_filename=f"{user.id}-cert.pdf",
                            storage_path="/tmp/cert.pdf", mime_type="application/pdf", size_bytes=10,
                            category="certificate", visibility="protected")
        db.session.add_all([cv, cert])
        db.session.flush()
        profile = UserProfile(
            user_id=user.id, location="Accra", teaching_subject=subject,
            preferred_level=level, preferred_employment_type="Full Time",
            curriculum_experience="GES / NaCCA Curriculum", cv_file_id=cv.id if complete else None,
            certificate_file_id=cert.id if complete else None,
        )
        pref = JobAlertPreference(
            user_id=user.id, subject=subject, location=self.zone.name, location_ids=str(self.zone.id),
            preferred_level=level, curriculum="GES / NaCCA Curriculum", employment_type="Full Time",
            alert_by_email=True, frequency="instant", is_default=True,
        )
        db.session.add_all([profile, pref])
        db.session.commit()
        return user, pref

    def login_admin(self):
        admin_role = Role(name="admin", description="Admin")
        admin = User(
            email="admin@example.com", first_name="Admin", role=admin_role,
            is_active=True, is_verified=True, teacher_service_enabled=False,
        )
        admin.set_password("AdminPassword1")
        db.session.add_all([admin_role, admin])
        db.session.commit()
        client = self.app.test_client()
        response = client.post(
            "/api/auth/login",
            json={"email": admin.email, "password": "AdminPassword1"},
        )
        self.assertEqual(response.status_code, 200)
        return client

    def test_exact_match_and_legacy_level_alias(self):
        user, pref = self.add_teacher("exact@example.com", level="JHS")
        self.assertTrue(_matches_job_alert(self.job, pref, user))

    def test_blank_or_mismatched_criteria_do_not_match(self):
        user, pref = self.add_teacher("wrong@example.com", subject="English Language")
        self.assertFalse(_matches_job_alert(self.job, pref, user))
        pref.subject = None
        self.assertFalse(_matches_job_alert(self.job, pref, user))
        pref.subject = "Mathematics"
        pref.location_ids = None
        pref.location = None
        self.assertFalse(_matches_job_alert(self.job, pref, user))

    def test_core_and_elective_subjects_do_not_cross_match(self):
        user, pref = self.add_teacher("elective-maths@example.com", subject="Elective Mathematics")
        self.job.subject = "Core Mathematics"
        self.assertFalse(_matches_job_alert(self.job, pref, user))

    def test_exact_subject_track_matches(self):
        user, pref = self.add_teacher("core-maths@example.com", subject="Core Mathematics")
        self.job.subject = "Core Mathematics"
        self.assertTrue(_matches_job_alert(self.job, pref, user))

    def test_legacy_broad_subject_bridges_to_specific_track(self):
        user, pref = self.add_teacher("legacy-maths@example.com", subject="Mathematics")
        self.job.subject = "Elective Mathematics"
        self.assertTrue(_matches_job_alert(self.job, pref, user))

        pref.subject = "Core Mathematics"
        self.job.subject = "Mathematics"
        self.assertTrue(_matches_job_alert(self.job, pref, user))

    def test_maths_alias_respects_track(self):
        user, pref = self.add_teacher("core-maths-alias@example.com", subject="Core Maths")
        self.job.subject = "Core Mathematics"
        self.assertTrue(_matches_job_alert(self.job, pref, user))
        self.job.subject = "Elective Mathematics"
        self.assertFalse(_matches_job_alert(self.job, pref, user))

    @patch("backend.api.admin.log_action")
    @patch("backend.api.admin.send_email", return_value=Mock(status="sent"))
    def test_dispatch_only_complete_exact_matches_and_deduplicates(self, send_email_mock, _log_action_mock):
        exact_user, _ = self.add_teacher("skgasante@gmail.com")
        self.add_teacher("shadyvigilante@gmail.com", complete=False)
        self.add_teacher("wrong@example.com", subject="English Language")
        db.session.add(JobAlertPreference(
            user_id=exact_user.id, subject="Mathematics", location=self.zone.name,
            location_ids=str(self.zone.id), preferred_level="JHS",
            curriculum="GES / NaCCA Curriculum", employment_type="Full Time",
            alert_by_email=True, frequency="instant",
        ))
        db.session.commit()

        sent = dispatch_job_alerts(self.job)

        self.assertEqual(sent, 1)
        self.assertEqual(send_email_mock.call_count, 1)
        message = send_email_mock.call_args.args[0]
        self.assertEqual(message.to, "skgasante@gmail.com")
        self.assertIn("A teaching opportunity matches your preferences", message.subject)
        self.assertIn("Good news", message.html)
        self.assertIn("View Job &amp; Apply", message.html)
        self.assertIn("https://realmindxgh.com/logo-white.png", message.html)

    @patch("backend.api.admin.send_email", return_value=Mock(status="skipped"))
    def test_skipped_delivery_is_not_counted_as_sent(self, send_email_mock):
        self.add_teacher("skgasante@gmail.com")
        self.assertEqual(dispatch_job_alerts(self.job), 0)
        self.assertEqual(send_email_mock.call_count, 1)

    @patch("backend.api.admin.log_action")
    @patch("backend.api.admin.send_email", return_value=Mock(status="sent"))
    def test_all_teacher_dispatch_includes_ineligible_accounts(self, send_email_mock, _log_action_mock):
        complete_user, _ = self.add_teacher("complete@example.com")
        incomplete_user, incomplete_pref = self.add_teacher(
            "incomplete@example.com", complete=False, subject="English Language"
        )
        incomplete_user.is_verified = False
        incomplete_pref.alert_by_email = False
        no_pref_user, no_pref = self.add_teacher("no-preference@example.com", complete=False)
        db.session.delete(no_pref)
        db.session.commit()

        result = dispatch_job_notifications(self.job, "all")

        self.assertEqual(result["eligible"], 3)
        self.assertEqual(result["accepted"], 3)
        self.assertEqual(
            {call.args[0].to for call in send_email_mock.call_args_list},
            {complete_user.email, incomplete_user.email, no_pref_user.email},
        )
        for call in send_email_mock.call_args_list:
            self.assertIn("New teaching opportunity", call.args[0].subject)
            self.assertNotIn("matches your preferences", call.args[0].subject)

    @patch("backend.api.admin.log_action")
    @patch("backend.api.admin.send_email", return_value=Mock(status="sent"))
    def test_all_teacher_dispatch_skips_disabled_internal_and_previously_notified_accounts(self, send_email_mock, _log_action_mock):
        notified_user, _ = self.add_teacher("notified@example.com", complete=False)
        disabled_user, _ = self.add_teacher("disabled@example.com", complete=False)
        disabled_user.is_active = False
        admin_role = Role(name="admin", description="Admin")
        internal_user = User(
            email="internal@example.com", first_name="Internal", role=admin_role,
            is_active=True, is_verified=True, teacher_service_enabled=True,
        )
        internal_user.set_password("AdminPassword1")
        db.session.add_all([admin_role, internal_user, CommunicationAttempt(
            channel="email", purpose="service_reminder", recipient_user_id=notified_user.id,
            masked_destination="no******@example.com", template_name="job_alert_all_teachers",
            provider="test", mode="live", status="accepted",
            idempotency_key=f"job-notification:{self.job.id}:{notified_user.id}",
            requested_at=self.job.created_at,
        )])
        db.session.commit()

        result = dispatch_job_notifications(self.job, "all")

        self.assertEqual(result["eligible"], 1)
        self.assertEqual(result["already_notified"], 1)
        self.assertEqual(result["pending"], 0)
        send_email_mock.assert_not_called()

    @patch("backend.api.admin.log_action")
    @patch("backend.api.admin.send_email", return_value=Mock(status="sent"))
    def test_admin_can_preview_and_send_all_teacher_job_notification(self, send_email_mock, _log_action_mock):
        self.add_teacher("broadcast@example.com", complete=False, subject="English Language")
        client = self.login_admin()

        preview = client.get(f"/api/admin/jobs/{self.job.id}/notifications/preview?audience=all")
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.get_json()["pending"], 1)

        response = client.post(
            f"/api/admin/jobs/{self.job.id}/notifications",
            json={"audience": "all", "confirm": True},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["accepted"], 1)
        send_email_mock.assert_called_once()

    def test_job_locations_include_active_non_delivery_areas(self):
        job_only = DeliveryZone(
            name="Ogbodjo", aliases="Ogbojo\nOgbodzo", fee=0,
            is_active=True, is_delivery_area=False, is_search_alias_only=False,
        )
        alias_only = DeliveryZone(
            name="Hidden alias", fee=0, is_active=True,
            is_delivery_area=False, is_search_alias_only=True,
        )
        db.session.add_all([job_only, alias_only])
        db.session.commit()
        client = self.login_admin()

        response = client.get("/api/admin/job-locations")

        self.assertEqual(response.status_code, 200)
        names = {item["name"] for item in response.get_json()["items"]}
        self.assertIn("Ogbodjo", names)
        self.assertNotIn("Hidden alias", names)

    @patch("backend.api.admin.dispatch_job_alerts", return_value=0)
    def test_competitive_salary_and_blank_subject_are_saved(self, _dispatch_mock):
        client = self.login_admin()

        response = client.post("/api/admin/jobs", json={
            "title": "Nursery Teacher",
            "organisation": "Test School",
            "delivery_zone_id": self.zone.id,
            "subject": "",
            "description": "Support early years learners.",
            "salary_display_mode": "competitive",
            "salary_min": 2000,
            "salary_max": 3000,
            "status": "draft",
        })

        self.assertEqual(response.status_code, 201)
        job = response.get_json()["job"]
        self.assertIsNone(job["subject"])
        self.assertEqual(job["salary_display_mode"], "competitive")
        self.assertIsNone(job["salary_min"])
        self.assertIsNone(job["salary_max"])

    def test_salary_range_requires_an_amount(self):
        client = self.login_admin()

        response = client.post("/api/admin/jobs", json={
            "title": "Teacher",
            "delivery_zone_id": self.zone.id,
            "description": "Description",
            "salary_display_mode": "range",
        })

        self.assertEqual(response.status_code, 400)
        self.assertIn("at least one salary amount", response.get_json()["error"])

    def test_reviewed_location_seed_is_job_only_until_delivery_is_configured(self):
        seeds = {item["name"]: item for item in delivery_zone_seed_items()}

        self.assertIn("Ogbodjo", seeds)
        self.assertFalse(seeds["Ogbodjo"]["is_delivery_area"])
        self.assertIn("Ogbojo", seeds["Ogbodjo"]["aliases"])

    @patch("backend.api.jobs.send_admin_alert", return_value=Mock(status="accepted"))
    @patch("backend.api.jobs.send_email", return_value=Mock(status="accepted"))
    def test_job_application_notifies_teacher_and_admin(self, teacher_email_mock, admin_alert_mock):
        teacher, _ = self.add_teacher("applicant@example.com")
        client = self.app.test_client()
        login = client.post(
            "/api/auth/login",
            json={"email": teacher.email, "password": "TeacherPassword1"},
        )
        self.assertEqual(login.status_code, 200)

        response = client.post(f"/api/jobs/{self.job.id}/apply", json={"cover_note": "Interested"})

        self.assertEqual(response.status_code, 201)
        teacher_email_mock.assert_called_once()
        admin_alert_mock.assert_called_once()
        self.assertEqual(
            admin_alert_mock.call_args.kwargs["template_name"],
            "job_application_admin_alert",
        )


if __name__ == "__main__":
    unittest.main()
