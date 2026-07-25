import io
import json
import sys
import unittest
from pathlib import Path
from datetime import datetime, timezone
from unittest.mock import patch

SITE_ROOT = Path(__file__).resolve().parents[1]
if str(SITE_ROOT) not in sys.path:
    sys.path.insert(0, str(SITE_ROOT))

from backend import create_app
from backend.config import Config
from backend.extensions import db
from backend.models import AuditLog, Role, UploadedFile, User, UserProfile


class ProfileSubmissionTestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    SECRET_KEY = "profile-submission-tests"
    BASE_URL = "http://localhost"
    BOOKSHOP_URL = "http://bookshop.localhost"
    CORS_ORIGINS = ["http://localhost", "http://bookshop.localhost"]
    RATELIMIT_ENABLED = False
    WTF_CSRF_ENABLED = False


def _make_complete_profile(user, session):
    profile = UserProfile(user_id=user.id)
    profile.location = "Accra"
    profile.teaching_subject = "Mathematics"
    profile.preferred_level = "Senior High"
    profile.preferred_employment_type = "Full-time"
    profile.curriculum_experience = "WASSCE"
    cv = UploadedFile(owner_id=user.id, original_filename="cv.pdf", stored_filename="cv_stored.pdf", storage_path="/tmp/cv.pdf", mime_type="application/pdf", size_bytes=100, category="cv")
    cert = UploadedFile(owner_id=user.id, original_filename="cert.pdf", stored_filename="cert_stored.pdf", storage_path="/tmp/cert.pdf", mime_type="application/pdf", size_bytes=100, category="certificate")
    session.add_all([profile, cv, cert])
    session.flush()
    profile.cv_file_id = cv.id
    profile.certificate_file_id = cert.id
    profile.profile_status = "complete"
    session.commit()
    return profile


class ProfileSubmissionTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(ProfileSubmissionTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        db.session.execute(db.text("PRAGMA foreign_keys = ON"))

        self.role = Role(name="user", description="Teacher")
        db.session.add(self.role)
        db.session.commit()

        self.teacher = User(
            email="teacher@example.com",
            first_name="Test",
            last_name="Teacher",
            role=self.role,
            is_active=True,
            is_verified=True,
        )
        self.teacher.set_password("Password1!")
        db.session.add(self.teacher)
        db.session.commit()

        self.client = self.app.test_client()
        self._login()

    def _login(self):
        resp = self.client.post("/api/auth/login", json={
            "email": "teacher@example.com",
            "password": "Password1!",
        })
        self.assertEqual(resp.status_code, 200)

    def tearDown(self):
        db.session.remove()
        db.session.execute(db.text("PRAGMA foreign_keys = OFF"))
        db.session.commit()
        db.drop_all()
        self.context.pop()

    # -- successful submission --

    @patch("backend.api.profile._send_submission_email")
    def test_submit_complete_profile(self, mock_email):
        _make_complete_profile(self.teacher, db.session)
        resp = self.client.post("/api/me/profile/submit")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data["profile_status"], "submitted")
        self.assertIsNotNone(data["submitted_at"])
        profile = db.session.get(UserProfile, self.teacher.profile.id)
        self.assertEqual(profile.profile_status, "submitted")
        self.assertIsNotNone(profile.submitted_at)
        mock_email.assert_called_once()

    @patch("backend.api.profile._send_submission_email")
    def test_submit_incomplete_profile_rejected(self, mock_email):
        profile = UserProfile(user_id=self.teacher.id)
        profile.location = "Accra"
        profile.teaching_subject = "Mathematics"
        profile.preferred_level = "Senior High"
        profile.preferred_employment_type = "Full-time"
        profile.curriculum_experience = "WASSCE"
        db.session.add(profile)
        db.session.commit()
        resp = self.client.post("/api/me/profile/submit")
        self.assertEqual(resp.status_code, 400)
        data = resp.get_json()
        self.assertIn("100% complete", data.get("error", ""))
        mock_email.assert_not_called()

    @patch("backend.api.profile._send_submission_email")
    def test_submit_no_cv_rejected(self, mock_email):
        profile = UserProfile(user_id=self.teacher.id)
        profile.location = "Accra"
        profile.teaching_subject = "Mathematics"
        profile.preferred_level = "Senior High"
        profile.preferred_employment_type = "Full-time"
        profile.curriculum_experience = "WASSCE"
        cert = UploadedFile(owner_id=self.teacher.id, original_filename="cert.pdf", stored_filename="cert_stored.pdf", storage_path="/tmp/cert.pdf", mime_type="application/pdf", size_bytes=100, category="certificate")
        db.session.add_all([profile, cert])
        db.session.flush()
        profile.certificate_file_id = cert.id
        profile.profile_status = "complete"
        db.session.commit()
        resp = self.client.post("/api/me/profile/submit")
        self.assertEqual(resp.status_code, 400)
        data = resp.get_json()
        self.assertIn("100% complete", data.get("error", ""))
        mock_email.assert_not_called()

    @patch("backend.api.profile._send_submission_email")
    def test_submit_no_cert_rejected(self, mock_email):
        profile = UserProfile(user_id=self.teacher.id)
        profile.location = "Accra"
        profile.teaching_subject = "Mathematics"
        profile.preferred_level = "Senior High"
        profile.preferred_employment_type = "Full-time"
        profile.curriculum_experience = "WASSCE"
        cv = UploadedFile(owner_id=self.teacher.id, original_filename="cv.pdf", stored_filename="cv_stored.pdf", storage_path="/tmp/cv.pdf", mime_type="application/pdf", size_bytes=100, category="cv")
        db.session.add_all([profile, cv])
        db.session.flush()
        profile.cv_file_id = cv.id
        profile.profile_status = "complete"
        db.session.commit()
        resp = self.client.post("/api/me/profile/submit")
        self.assertEqual(resp.status_code, 400)
        data = resp.get_json()
        self.assertIn("100% complete", data.get("error", ""))
        mock_email.assert_not_called()

    @patch("backend.api.profile._send_submission_email")
    def test_submit_already_submitted(self, mock_email):
        _make_complete_profile(self.teacher, db.session)
        resp1 = self.client.post("/api/me/profile/submit")
        self.assertEqual(resp1.status_code, 200)
        resp2 = self.client.post("/api/me/profile/submit")
        self.assertEqual(resp2.status_code, 200)
        data = resp2.get_json()
        self.assertEqual(data["profile_status"], "submitted")
        self.assertIn("already been submitted", data.get("message", ""))
        mock_email.assert_called_once()
        audit_entries = AuditLog.query.filter_by(action="teacher_profile_submitted").all()
        self.assertEqual(len(audit_entries), 1)

    @patch("backend.api.profile._send_submission_email")
    def test_submit_revision_required_rejected(self, mock_email):
        profile = _make_complete_profile(self.teacher, db.session)
        profile.profile_status = "revision_required"
        profile.review_notes = "Please update your CV"
        db.session.commit()
        resp = self.client.post("/api/me/profile/submit")
        self.assertEqual(resp.status_code, 400)
        data = resp.get_json()
        self.assertIn("Please update your profile", data.get("error", ""))
        mock_email.assert_not_called()

    # -- profile locking --

    @patch("backend.api.profile._send_submission_email")
    def test_profile_locked_after_submission(self, mock_email):
        profile = _make_complete_profile(self.teacher, db.session)
        resp = self.client.post("/api/me/profile/submit")
        self.assertEqual(resp.status_code, 200)
        resp_update = self.client.put("/api/me/profile", json={"location": "Kumasi"})
        self.assertEqual(resp_update.status_code, 423)
        data = resp_update.get_json()
        self.assertIn("cannot be edited", data.get("error", "").lower())

    @patch("backend.api.profile._send_submission_email")
    def test_submitted_profile_upload_blocked(self, mock_email):
        _make_complete_profile(self.teacher, db.session)
        resp = self.client.post("/api/me/profile/submit")
        self.assertEqual(resp.status_code, 200)
        resp_upload = self.client.post("/api/me/uploads", data={
            "file": (io.BytesIO(b"dummy content"), "cv_new.pdf"),
            "kind": "cv",
        }, content_type="multipart/form-data")
        self.assertNotEqual(resp_upload.status_code, 200)

    # -- audit logging --

    @patch("backend.api.profile._send_submission_email")
    def test_audit_logged_on_submit(self, mock_email):
        _make_complete_profile(self.teacher, db.session)
        resp = self.client.post("/api/me/profile/submit")
        self.assertEqual(resp.status_code, 200)
        audit_entries = AuditLog.query.filter_by(action="teacher_profile_submitted").all()
        self.assertEqual(len(audit_entries), 1)
        self.assertEqual(audit_entries[0].actor_id, self.teacher.id)

    # -- email sending --

    @patch("backend.api.profile._send_submission_email")
    def test_email_sent_on_submit(self, mock_email):
        _make_complete_profile(self.teacher, db.session)
        resp = self.client.post("/api/me/profile/submit")
        self.assertEqual(resp.status_code, 200)
        mock_email.assert_called_once()

    # -- get_or_create_profile creates profile if missing --

    @patch("backend.api.profile._send_submission_email")
    def test_submit_auto_creates_profile_if_missing(self, mock_email):
        self.assertIsNone(self.teacher.profile)
        resp = self.client.post("/api/me/profile/submit")
        self.assertEqual(resp.status_code, 400)
        mock_email.assert_not_called()

    # -- submission_returns_submitted_at_iso --

    @patch("backend.api.profile._send_submission_email")
    def test_submit_returns_iso_submitted_at(self, mock_email):
        _make_complete_profile(self.teacher, db.session)
        resp = self.client.post("/api/me/profile/submit")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIsNotNone(data.get("submitted_at"))
        from datetime import datetime
        datetime.fromisoformat(data["submitted_at"])


    # -- non-teacher account rejection --

    @patch("backend.api.profile._send_submission_email")
    def test_non_teacher_rejected(self, mock_email):
        self.teacher.teacher_service_enabled = False
        db.session.commit()
        _make_complete_profile(self.teacher, db.session)
        resp = self.client.post("/api/me/profile/submit")
        self.assertEqual(resp.status_code, 403)
        data = resp.get_json()
        self.assertIn("not available", data.get("error", "").lower())
        mock_email.assert_not_called()

    # -- update_profile recalculates status after revision_required --

    def test_revision_becomes_complete_after_fix(self):
        profile = _make_complete_profile(self.teacher, db.session)
        profile.profile_status = "revision_required"
        profile.review_notes = "Please update your location"
        profile.location = None
        db.session.commit()
        resp = self.client.put("/api/me/profile", json={"location": "Kumasi"})
        self.assertEqual(resp.status_code, 200)
        db.session.refresh(profile)
        self.assertEqual(profile.profile_status, "complete")
        self.assertEqual(profile.review_notes, "Please update your location")

    def test_revision_becomes_incomplete_if_still_missing(self):
        profile = _make_complete_profile(self.teacher, db.session)
        profile.profile_status = "revision_required"
        profile.review_notes = "Please upload a new CV"
        profile.cv_file_id = None
        profile.certificate_file_id = None
        db.session.commit()
        resp = self.client.put("/api/me/profile", json={"bio": "Just changing bio, not fixing CV"})
        self.assertEqual(resp.status_code, 200)
        db.session.refresh(profile)
        self.assertEqual(profile.profile_status, "incomplete")
        self.assertEqual(profile.review_notes, "Please upload a new CV")

    # -- upload preserves review_notes in revision_required --

    @patch("backend.api.profile._send_submission_email")
    def test_upload_preserves_review_notes_in_revision(self, mock_email):
        profile = _make_complete_profile(self.teacher, db.session)
        old_cv_id = profile.cv_file_id
        profile.profile_status = "revision_required"
        profile.review_notes = "Please upload a new CV"
        db.session.commit()
        resp = self.client.post("/api/me/uploads", data={
            "file": (io.BytesIO(b"new cv content"), "cv_v2.pdf"),
            "kind": "cv",
        }, content_type="multipart/form-data")
        self.assertEqual(resp.status_code, 201)
        db.session.refresh(profile)
        self.assertEqual(profile.profile_status, "complete")
        self.assertEqual(profile.review_notes, "Please upload a new CV")
        self.assertNotEqual(profile.cv_file_id, old_cv_id)

    # -- account identity field locking --

    def test_account_name_locked_when_submitted(self):
        _make_complete_profile(self.teacher, db.session)
        resp_submit = self.client.post("/api/me/profile/submit")
        self.assertEqual(resp_submit.status_code, 200)
        resp = self.client.put("/api/me/account", json={"first_name": "Changed", "last_name": "Name"})
        self.assertEqual(resp.status_code, 423)
        data = resp.get_json()
        self.assertIn("identity", data.get("error", "").lower())

    def test_account_first_name_locked_when_submitted(self):
        _make_complete_profile(self.teacher, db.session)
        self.client.post("/api/me/profile/submit")
        resp = self.client.put("/api/me/account", json={"first_name": "Changed"})
        self.assertEqual(resp.status_code, 423)

    def test_account_last_name_locked_when_submitted(self):
        _make_complete_profile(self.teacher, db.session)
        self.client.post("/api/me/profile/submit")
        resp = self.client.put("/api/me/account", json={"first_name": "Test", "last_name": "Changed"})
        self.assertEqual(resp.status_code, 423)

    def test_account_name_editable_when_incomplete(self):
        resp = self.client.put("/api/me/account", json={"first_name": "NewFirst", "last_name": "NewLast"})
        self.assertEqual(resp.status_code, 200)

    def test_account_name_editable_when_complete(self):
        _make_complete_profile(self.teacher, db.session)
        resp = self.client.put("/api/me/account", json={"first_name": "NewFirst", "last_name": "NewLast"})
        self.assertEqual(resp.status_code, 200)

    def test_account_name_editable_when_revision_required(self):
        profile = _make_complete_profile(self.teacher, db.session)
        profile.profile_status = "revision_required"
        db.session.commit()
        resp = self.client.put("/api/me/account", json={"first_name": "NewFirst", "last_name": "NewLast"})
        self.assertEqual(resp.status_code, 200)


if __name__ == "__main__":
    unittest.main()
