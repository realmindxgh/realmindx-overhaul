import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

SITE_ROOT = Path(__file__).resolve().parents[1]
if str(SITE_ROOT) not in sys.path:
    sys.path.insert(0, str(SITE_ROOT))

from backend import create_app
from backend.api.admin import _matches_job_alert, dispatch_job_alerts
from backend.config import Config
from backend.extensions import db
from backend.models import DeliveryZone, Job, JobAlertPreference, Role, UploadedFile, User, UserProfile


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


if __name__ == "__main__":
    unittest.main()
