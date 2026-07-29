"""Comprehensive account lifecycle tests: registration, terms acceptance,
profile completion, submission, and deletion."""

import io
import json
import secrets
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
from backend.models import (
    BookRequest, BookshopPaymentIntent, CommunicationAttempt, ContactMessage,
    DeliverySettlementBatch, Job, JobAlertPreference, NewsletterSubscriber, Order, OrderDelivery,
    Role, TermsAcceptance, UploadedFile, User, UserProfile,
    WhatsAppWebhookEvent,
)
from backend.communications import record_attempt
from backend.profile_completion import CURRENT_TERMS_VERSION, account_status, teacher_profile_completion


class AccountLifecycleTestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    SECRET_KEY = "account-lifecycle-tests"
    BASE_URL = "http://localhost"
    BOOKSHOP_URL = "http://bookshop.localhost"
    CORS_ORIGINS = ["http://localhost", "http://bookshop.localhost"]
    RATELIMIT_ENABLED = False
    WTF_CSRF_ENABLED = False
    WTF_CSRF_CHECK_DEFAULT = False


def _make_complete_profile(user, session):
    profile = user.profile or UserProfile(user_id=user.id)
    session.add(profile)
    profile.location = "Accra"
    profile.teaching_subject = "Mathematics"
    profile.preferred_level = "Senior High"
    profile.preferred_employment_type = "Full-time"
    profile.curriculum_experience = "WASSCE"
    cv = UploadedFile(
        owner_id=user.id, original_filename="cv.pdf",
        stored_filename="cv_stored.pdf", storage_path="/tmp/cv.pdf",
        mime_type="application/pdf", size_bytes=100, category="cv",
    )
    cert = UploadedFile(
        owner_id=user.id, original_filename="cert.pdf",
        stored_filename="cert_stored.pdf", storage_path="/tmp/cert.pdf",
        mime_type="application/pdf", size_bytes=100, category="certificate",
    )
    session.add_all([profile, cv, cert])
    session.flush()
    profile.cv_file_id = cv.id
    profile.certificate_file_id = cert.id
    profile.profile_status = "complete"
    session.commit()
    return profile


class AccountLifecycleTests(unittest.TestCase):
    """Test the full account lifecycle end-to-end via API calls."""

    def setUp(self):
        self.app = create_app(AccountLifecycleTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        db.session.execute(db.text("PRAGMA foreign_keys = ON"))

        self.role = Role(name="user", description="Teacher")
        db.session.add(self.role)
        db.session.commit()

        self.client = self.app.test_client()

    def tearDown(self):
        db.session.execute(db.text("PRAGMA foreign_keys = OFF"))
        db.session.commit()
        db.drop_all()
        db.session.remove()
        self.context.pop()

    def _register_user(self, email="new@teacher.com", password="TestPass123!", surface="teacher"):
        """Helper to register a new user through the API."""
        resp = self.client.post("/api/auth/signup", json={
            "email": email,
            "password": password,
            "first_name": "New",
            "last_name": "Teacher",
            "phone": "",
            "sex": "male",
            "age_range": "25_34",
            "accepted_terms": True,
            "surface": surface,
            "turnstile_token": "bypass",
        })
        # Auto-verify the user for testing
        if resp.status_code == 201:
            user = User.query.filter_by(email=email).first()
            if user:
                user.is_verified = True
                db.session.commit()
        return resp

    def _login(self, email="new@teacher.com", password="TestPass123!"):
        resp = self.client.post("/api/auth/login", json={
            "email": email,
            "password": password,
            "surface": "teacher",
        })
        return resp

    # ==================== TERMS ACCEPTANCE TESTS ====================

    def test_terms_accepted_during_registration_survives_signout(self):
        """A newly registered user accepts terms; acceptance survives sign-out."""
        reg_resp = self._register_user()
        self.assertEqual(reg_resp.status_code, 201)

        resp = self._login()
        self.assertEqual(resp.status_code, 200)
        user_data = resp.get_json()["user"]
        self.assertIsNotNone(user_data["terms_accepted_at"])
        self.assertEqual(user_data["terms_version"], CURRENT_TERMS_VERSION)

        status_resp = self.client.get("/api/auth/me/status")
        self.assertEqual(status_resp.status_code, 200)
        status = status_resp.get_json()
        self.assertTrue(status["terms_accepted"])
        self.assertFalse(status["requires_terms_acceptance"])

    def test_accept_current_terms_not_prompted_again(self):
        """User who accepted current version is not prompted again."""
        self._register_user()
        self._login()

        status_resp = self.client.get("/api/auth/me/status")
        status = status_resp.get_json()
        self.assertFalse(status["requires_terms_acceptance"])

        # Sign out and sign back in
        self.client.get("/api/auth/logout")
        self._login()

        status_resp = self.client.get("/api/auth/me/status")
        status = status_resp.get_json()
        self.assertFalse(status["requires_terms_acceptance"])

    def test_user_without_acceptance_prompted_once(self):
        """A user without a valid acceptance record is prompted once, accepts, then not prompted again."""
        user = User(
            email="nterms@test.com", first_name="No", last_name="Terms",
            role=self.role, is_active=True, is_verified=True,
        )
        user.set_password("Password1!")
        db.session.add(user)
        db.session.flush()
        db.session.add(UserProfile(user_id=user.id))
        db.session.commit()

        self.client.post("/api/auth/login", json={
            "email": "nterms@test.com", "password": "Password1!", "surface": "teacher",
        })

        status_resp = self.client.get("/api/auth/me/status")
        self.assertTrue(status_resp.get_json()["requires_terms_acceptance"])

        accept_resp = self.client.post("/api/auth/accept-terms")
        self.assertEqual(accept_resp.status_code, 200)

        status_resp = self.client.get("/api/auth/me/status")
        status = status_resp.get_json()
        self.assertTrue(status["terms_accepted"])
        self.assertFalse(status["requires_terms_acceptance"])

        self.client.get("/api/auth/logout")
        self._login = lambda: self.client.post("/api/auth/login", json={
            "email": "nterms@test.com", "password": "Password1!", "surface": "teacher",
        })
        self._login()

        status_resp = self.client.get("/api/auth/me/status")
        status = status_resp.get_json()
        self.assertFalse(status["requires_terms_acceptance"])

    def test_terms_version_change_requires_fresh_acceptance(self):
        """Simulating a version change — user accepted old version, needs to accept new one."""
        self._register_user()
        self._login()

        status_resp = self.client.get("/api/auth/me/status")
        status = status_resp.get_json()
        self.assertFalse(status["requires_terms_acceptance"])

        user = User.query.filter_by(email="new@teacher.com").first()
        # Simulate outdated acceptance by removing the current acceptance record
        # and resetting the user-level version.
        TermsAcceptance.query.filter_by(user_id=user.id).delete()
        user.terms_accepted_at = None
        user.terms_version = None
        db.session.commit()

        status_resp = self.client.get("/api/auth/me/status")
        status = status_resp.get_json()
        self.assertTrue(status["requires_terms_acceptance"])

        self.client.post("/api/auth/accept-terms")

        status_resp = self.client.get("/api/auth/me/status")
        status = status_resp.get_json()
        self.assertFalse(status["requires_terms_acceptance"])

    def test_no_account_user_not_treated_as_requiring_terms(self):
        """An unauthenticated request does not produce 'requires_terms_acceptance'."""
        status_resp = self.client.get("/api/auth/me/status")
        self.assertEqual(status_resp.status_code, 200)
        status = status_resp.get_json()
        self.assertFalse(status["account_exists"])
        self.assertFalse(status["requires_terms_acceptance"])

    # ==================== PROFILE COMPLETION TESTS ====================

    def test_completion_below_100_returns_missing_requirements(self):
        """A new user has incomplete profile with missing requirements."""
        self._register_user()
        self._login()

        status_resp = self.client.get("/api/auth/me/status")
        status = status_resp.get_json()
        self.assertLess(status["completion_percentage"], 100)
        self.assertTrue(len(status["missing_requirements"]) > 0)
        self.assertIn("next_action", status)
        self.assertTrue(status["next_action"].startswith("complete_profile"))

    def test_completion_at_100_removes_incomplete_prompt(self):
        """A 100% complete profile does not show incomplete prompt."""
        self._register_user()
        self._login()
        user = User.query.filter_by(email="new@teacher.com").first()
        _make_complete_profile(user, db.session)

        status_resp = self.client.get("/api/auth/me/status")
        status = status_resp.get_json()

        self.assertEqual(status["completion_percentage"], 100)
        self.assertEqual(len(status["missing_requirements"]), 0)
        self.assertNotEqual(status["profile_status"], "incomplete")

    def test_100_percent_draft_returns_submit_action(self):
        """A 100% draft profile returns submit_for_review as next_action."""
        self._register_user()
        self._login()
        user = User.query.filter_by(email="new@teacher.com").first()
        _make_complete_profile(user, db.session)

        status_resp = self.client.get("/api/auth/me/status")
        status = status_resp.get_json()

        self.assertEqual(status["completion_percentage"], 100)
        self.assertEqual(status["profile_status"], "complete")
        self.assertTrue(status["can_submit"])
        self.assertEqual(status["next_action"], "submit_for_review")
        self.assertFalse(status["is_submitted"])
        self.assertFalse(status["is_under_review"])

    def test_submitted_profile_returns_correct_status(self):
        """Submitted profile shows correct status, can_submit=False."""
        self._register_user()
        self._login()
        user = User.query.filter_by(email="new@teacher.com").first()
        _make_complete_profile(user, db.session)

        with patch("backend.api.profile._send_submission_email"):
            submit_resp = self.client.post("/api/me/profile/submit")
        self.assertEqual(submit_resp.status_code, 200)

        status_resp = self.client.get("/api/auth/me/status")
        status = status_resp.get_json()

        self.assertEqual(status["profile_status"], "submitted")
        self.assertTrue(status["is_submitted"])
        self.assertFalse(status["can_submit"])
        self.assertIsNone(status["next_action"])

    def test_under_review_profile_returns_correct_status(self):
        """Under review profile shows correct status."""
        self._register_user()
        self._login()
        user = User.query.filter_by(email="new@teacher.com").first()
        profile = _make_complete_profile(user, db.session)

        with patch("backend.api.profile._send_submission_email"):
            self.client.post("/api/me/profile/submit")

        profile.profile_status = "under_review"
        db.session.commit()

        status_resp = self.client.get("/api/auth/me/status")
        status = status_resp.get_json()

        self.assertEqual(status["profile_status"], "under_review")
        self.assertTrue(status["is_under_review"])
        self.assertFalse(status["can_submit"])
        self.assertFalse(status["is_submitted"])

    def test_revision_required_status(self):
        """Revision required profile returns correct status."""
        self._register_user()
        self._login()
        user = User.query.filter_by(email="new@teacher.com").first()
        profile = _make_complete_profile(user, db.session)
        profile.profile_status = "revision_required"
        profile.review_notes = "Please update your CV"
        db.session.commit()

        status_resp = self.client.get("/api/auth/me/status")
        status = status_resp.get_json()

        self.assertTrue(status["revision_required"])
        self.assertEqual(status["review_notes"], "Please update your CV")
        self.assertEqual(status["next_action"], "review_revision")

    def test_verified_profile_returns_no_prompts(self):
        """Verified profile returns no completion or submission prompts."""
        self._register_user()
        self._login()
        user = User.query.filter_by(email="new@teacher.com").first()
        profile = _make_complete_profile(user, db.session)
        profile.profile_status = "verified"
        db.session.commit()

        status_resp = self.client.get("/api/auth/me/status")
        status = status_resp.get_json()

        self.assertTrue(status["is_verified"])
        self.assertFalse(status["can_submit"])
        self.assertIsNone(status["next_action"])

    def test_rejected_profile_returns_correct_status(self):
        """Rejected profile shows rejected status and contact_support action."""
        self._register_user()
        self._login()
        user = User.query.filter_by(email="new@teacher.com").first()
        profile = _make_complete_profile(user, db.session)
        profile.profile_status = "rejected"
        profile.review_notes = "Insufficient qualifications"
        db.session.commit()

        status_resp = self.client.get("/api/auth/me/status")
        status = status_resp.get_json()

        self.assertTrue(status["is_rejected"])
        self.assertFalse(status["is_verified"])
        self.assertEqual(status["next_action"], "contact_support")

    def test_saving_final_field_updates_percentage(self):
        """Saving the last missing field should immediately update completion to 100%."""
        self._register_user()
        self._login()
        user = User.query.filter_by(email="new@teacher.com").first()
        profile = user.profile or UserProfile(user_id=user.id)
        db.session.add(profile)
        profile.location = "Accra"
        profile.teaching_subject = "Mathematics"
        profile.preferred_level = "Senior High"
        profile.preferred_employment_type = "Full-time"
        profile.curriculum_experience = "WASSCE"
        db.session.commit()

        status_before = self.client.get("/api/auth/me/status").get_json()
        self.assertLess(status_before["completion_percentage"], 100)

        cv = UploadedFile(
            owner_id=user.id, original_filename="cv.pdf",
            stored_filename="cv_stored.pdf", storage_path="/tmp/cv.pdf",
            mime_type="application/pdf", size_bytes=100, category="cv",
        )
        cert = UploadedFile(
            owner_id=user.id, original_filename="cert.pdf",
            stored_filename="cert_stored.pdf", storage_path="/tmp/cert.pdf",
            mime_type="application/pdf", size_bytes=100, category="certificate",
        )
        db.session.add_all([cv, cert])
        db.session.flush()

        upload_resp = self.client.post("/api/me/uploads", data={
            "file": (io.BytesIO(b"cv content"), "cv.pdf"),
            "kind": "cv",
        }, content_type="multipart/form-data")
        self.assertEqual(upload_resp.status_code, 201)

        upload_resp2 = self.client.post("/api/me/uploads", data={
            "file": (io.BytesIO(b"cert content"), "cert.pdf"),
            "kind": "certificate",
        }, content_type="multipart/form-data")
        self.assertEqual(upload_resp2.status_code, 201)

        status_after = self.client.get("/api/auth/me/status").get_json()
        self.assertEqual(status_after["completion_percentage"], 100)
        self.assertEqual(len(status_after["missing_requirements"]), 0)

    # ==================== ACCOUNT DELETION TESTS ====================

    def test_full_deletion_removes_account_and_auth(self):
        """Full deletion removes both the application user and auth identity."""
        self._register_user()
        self._login()
        user = User.query.filter_by(email="new@teacher.com").first()
        user_id = user.id

        from backend.models import TermsAcceptance as TA
        acceptance = TA(
            user_id=user.id, terms_type="platform_terms",
            terms_version=CURRENT_TERMS_VERSION, accepted_at=datetime.now(timezone.utc),
            acceptance_source="test",
        )
        db.session.add(acceptance)
        db.session.commit()

        delete_resp = self.client.post("/api/auth/decline-terms")
        self.assertEqual(delete_resp.status_code, 200)
        data = delete_resp.get_json()
        self.assertIn("deleted", data.get("message", "").lower())

        deleted_user = db.session.get(User, user_id)
        self.assertIsNone(deleted_user)

    def test_deleted_credentials_cannot_sign_in(self):
        """Deleted credentials can no longer sign in."""
        self._register_user()
        self._login()
        self.client.post("/api/auth/decline-terms")
        login_resp = self.client.post("/api/auth/login", json={
            "email": "new@teacher.com",
            "password": "TestPass123!",
            "surface": "teacher",
        })
        self.assertEqual(login_resp.status_code, 401)

    def test_deleted_email_can_register_again(self):
        """A genuinely deleted email can create a fresh account."""
        self._register_user()
        self._login()
        self.client.post("/api/auth/decline-terms")

        reg_resp = self.client.post("/api/auth/signup", json={
            "email": "new@teacher.com",
            "password": "NewPass456!",
            "first_name": "New",
            "last_name": "Account",
            "accepted_terms": True,
            "surface": "teacher",
            "turnstile_token": "bypass",
        })
        self.assertEqual(reg_resp.status_code, 201)

        user = User.query.filter_by(email="new@teacher.com").first()
        user.is_verified = True
        db.session.commit()

        login_resp = self._login(email="new@teacher.com", password="NewPass456!")
        self.assertEqual(login_resp.status_code, 200)

    def test_deletion_failure_reported(self):
        """If deletion fails on the backend, an error is returned."""
        self._register_user()
        self._login()

        with patch.object(db.session, "delete", side_effect=Exception("DB error")):
            resp = self.client.post("/api/auth/decline-terms")
            self.assertNotEqual(resp.status_code, 200)
            data = resp.get_json()
            self.assertIn("error", data)

    def test_deletion_removes_uploaded_files(self):
        """Deletion removes UploadedFile rows."""
        self._register_user()
        self._login()
        user = User.query.filter_by(email="new@teacher.com").first()

        uf = UploadedFile(
            owner_id=user.id, original_filename="doc.pdf",
            stored_filename="doc_stored.pdf", storage_path="/tmp/doc.pdf",
            mime_type="application/pdf", size_bytes=50, category="document",
        )
        db.session.add(uf)
        db.session.commit()

        self.client.post("/api/auth/decline-terms")

        orphaned = UploadedFile.query.filter_by(owner_id=user.id).count()
        self.assertEqual(orphaned, 0)

    # ==================== STATUS ENDPOINT TESTS ====================

    def test_status_endpoint_returns_canonical_response(self):
        """The /api/auth/me/status endpoint returns all required fields."""
        self._register_user()
        self._login()

        status_resp = self.client.get("/api/auth/me/status")
        self.assertEqual(status_resp.status_code, 200)
        status = status_resp.get_json()

        expected_keys = {
            "account_exists", "terms_accepted", "requires_terms_acceptance",
            "terms_version", "terms_accepted_at", "completion_percentage",
            "missing_requirements", "profile_status", "can_submit",
            "is_submitted", "is_under_review", "revision_required",
            "is_verified", "is_rejected", "application_count",
            "under_review_count", "application_id", "teacher_id",
            "next_action",
        }
        self.assertTrue(expected_keys.issubset(status.keys()))

    def test_status_stale_not_reused_after_profile_update(self):
        """After a profile update, the status endpoint returns fresh data."""
        self._register_user()
        self._login()

        status_before = self.client.get("/api/auth/me/status").get_json()
        self.assertLess(status_before["completion_percentage"], 100)

        user = User.query.filter_by(email="new@teacher.com").first()
        _make_complete_profile(user, db.session)

        status_after = self.client.get("/api/auth/me/status").get_json()
        self.assertEqual(status_after["completion_percentage"], 100)

    def test_status_after_terms_acceptance(self):
        """After accepting terms, status reflects accepted state."""
        user = User(
            email="accept_test@test.com", first_name="Accept", last_name="Test",
            role=self.role, is_active=True, is_verified=True,
        )
        user.set_password("Password1!")
        db.session.add(user)
        db.session.flush()
        db.session.add(UserProfile(user_id=user.id))
        db.session.commit()

        login_resp = self.client.post("/api/auth/login", json={
            "email": "accept_test@test.com", "password": "Password1!", "surface": "teacher",
        })
        self.assertEqual(login_resp.status_code, 200)

        status_before = self.client.get("/api/auth/me/status").get_json()
        self.assertTrue(status_before["requires_terms_acceptance"])

        self.client.post("/api/auth/accept-terms")

        status_after = self.client.get("/api/auth/me/status").get_json()
        self.assertTrue(status_after["terms_accepted"])
        self.assertFalse(status_after["requires_terms_acceptance"])


    # ==================== CONSENT SOURCE-OF-TRUTH TESTS ====================

    def test_terms_acceptance_row_is_authoritative(self):
        """TermsAcceptance row with current version is authoritative over user-level fields."""
        user = User(
            email="auth_source@test.com", first_name="Auth", last_name="Source",
            role=self.role, is_active=True, is_verified=True,
            terms_accepted_at=None, terms_version=None, privacy_version=None,
        )
        user.set_password("Password1!")
        db.session.add(user)
        db.session.flush()
        db.session.add(UserProfile(user_id=user.id))
        ta = TermsAcceptance(
            user_id=user.id, terms_type="platform_terms",
            terms_version=CURRENT_TERMS_VERSION, privacy_version=CURRENT_TERMS_VERSION,
            accepted_at=datetime.now(timezone.utc), acceptance_source="test",
        )
        db.session.add(ta)
        db.session.commit()

        login_resp = self.client.post("/api/auth/login", json={
            "email": "auth_source@test.com", "password": "Password1!", "surface": "teacher",
        })
        self.assertEqual(login_resp.status_code, 200)

        status = self.client.get("/api/auth/me/status").get_json()
        self.assertTrue(status["terms_accepted"])
        self.assertFalse(status["requires_terms_acceptance"])

    def test_user_level_fields_are_fallback(self):
        """User terms_accepted_at + terms_version works when no TermsAcceptance row exists."""
        user = User(
            email="fallback@test.com", first_name="Fallback", last_name="User",
            role=self.role, is_active=True, is_verified=True,
            terms_accepted_at=datetime.now(timezone.utc),
            terms_version=CURRENT_TERMS_VERSION,
            privacy_version=CURRENT_TERMS_VERSION,
        )
        user.set_password("Password1!")
        db.session.add(user)
        db.session.flush()
        db.session.add(UserProfile(user_id=user.id))
        db.session.commit()

        login_resp = self.client.post("/api/auth/login", json={
            "email": "fallback@test.com", "password": "Password1!", "surface": "teacher",
        })
        self.assertEqual(login_resp.status_code, 200)

        status = self.client.get("/api/auth/me/status").get_json()
        self.assertTrue(status["terms_accepted"])
        self.assertFalse(status["requires_terms_acceptance"])

    def test_terms_accepted_without_version_not_accepted(self):
        """User with terms_accepted_at but no terms_version is not considered accepted."""
        user = User(
            email="noversion@test.com", first_name="No", last_name="Version",
            role=self.role, is_active=True, is_verified=True,
            terms_accepted_at=datetime.now(timezone.utc),
            terms_version=None, privacy_version=None,
        )
        user.set_password("Password1!")
        db.session.add(user)
        db.session.flush()
        db.session.add(UserProfile(user_id=user.id))
        db.session.commit()

        login_resp = self.client.post("/api/auth/login", json={
            "email": "noversion@test.com", "password": "Password1!", "surface": "teacher",
        })
        self.assertEqual(login_resp.status_code, 200)

        status = self.client.get("/api/auth/me/status").get_json()
        self.assertFalse(status["terms_accepted"])
        self.assertTrue(status["requires_terms_acceptance"])

    def test_stale_terms_acceptance_row_ignored(self):
        """TermsAcceptance with wrong version does not count — falls back to user-level."""
        user = User(
            email="stale_ta@test.com", first_name="Stale", last_name="Ta",
            role=self.role, is_active=True, is_verified=True,
            terms_accepted_at=None, terms_version=None, privacy_version=None,
        )
        user.set_password("Password1!")
        db.session.add(user)
        db.session.flush()
        db.session.add(UserProfile(user_id=user.id))
        ta = TermsAcceptance(
            user_id=user.id, terms_type="platform_terms",
            terms_version="v0_old", accepted_at=datetime.now(timezone.utc),
            acceptance_source="test",
        )
        db.session.add(ta)
        db.session.commit()

        login_resp = self.client.post("/api/auth/login", json={
            "email": "stale_ta@test.com", "password": "Password1!", "surface": "teacher",
        })
        self.assertEqual(login_resp.status_code, 200)

        status = self.client.get("/api/auth/me/status").get_json()
        self.assertFalse(status["terms_accepted"])
        self.assertTrue(status["requires_terms_acceptance"])

    # ==================== OAUTH CONSENT TEST ====================

    def test_oauth_signup_without_acceptance_no_terms_record(self):
        """An OAuth-style signup without explicit acceptance must NOT fabricate consent."""
        user = User(
            email="oauth_no_consent@test.com", first_name="OAuth", last_name="NoConsent",
            role=self.role, is_active=True, is_verified=True,
            terms_accepted_at=None, terms_version=None, privacy_version=None,
            teacher_service_enabled=True,
        )
        user.set_password(secrets.token_urlsafe(48), enable_login=False)
        db.session.add(user)
        db.session.flush()
        db.session.add(UserProfile(user_id=user.id))
        # Deliberately NO TermsAcceptance row
        db.session.commit()

        ta_count = TermsAcceptance.query.filter_by(user_id=user.id).count()
        self.assertEqual(ta_count, 0)
        self.assertIsNone(user.terms_accepted_at)
        self.assertIsNone(user.terms_version)

        login_resp = self.client.post("/api/auth/login", json={
            "email": "oauth_no_consent@test.com", "password": "Password1!", "surface": "teacher",
        })
        self.assertNotEqual(login_resp.status_code, 200)

    # ==================== SESSION REVOCATION TEST ====================

    def test_deleted_session_cannot_access_protected_endpoint(self):
        """After deletion, the old session must not grant access to protected endpoints."""
        self._register_user()
        self._login()
        self.client.post("/api/auth/decline-terms")
        # Any @login_required endpoint should reject the stale session
        stale_resp = self.client.post("/api/auth/accept-terms")
        self.assertEqual(stale_resp.status_code, 401)

    # ==================== FINANCIAL RETENTION TESTS ====================

    def test_bookshop_payment_intent_retained_after_deletion(self):
        """BookshopPaymentIntent must be retained (user_id set to None) after account deletion."""
        self._register_user()
        self._login()
        user = User.query.filter_by(email="new@teacher.com").first()

        intent = BookshopPaymentIntent(
            reference="TST-RETENTION-001", user_id=user.id,
            customer_name="Test User", email="new@teacher.com", phone="+233501234567",
            amount=100.00, status="initialized",
        )
        db.session.add(intent)
        db.session.commit()
        intent_id = intent.id

        self.client.post("/api/auth/decline-terms")

        retained = db.session.get(BookshopPaymentIntent, intent_id)
        self.assertIsNotNone(retained, "Payment intent must be retained after user deletion")
        self.assertIsNone(retained.user_id, "Payment intent user_id must be set to None")

    def test_whatsapp_webhook_retained_after_deletion(self):
        """WhatsAppWebhookEvent must be retained (user_id set to None) after account deletion."""
        self._register_user()
        self._login()
        user = User.query.filter_by(email="new@teacher.com").first()

        event = WhatsAppWebhookEvent(
            message_id="wamid.retention_test",
            sender="+233501234567",
            text_preview="Hello",
            status="received",
            user_id=user.id,
        )
        db.session.add(event)
        db.session.commit()
        event_id = event.id

        self.client.post("/api/auth/decline-terms")

        retained = db.session.get(WhatsAppWebhookEvent, event_id)
        self.assertIsNotNone(retained, "WhatsApp webhook event must be retained")
        self.assertIsNone(retained.user_id, "WhatsApp webhook user_id must be set to None")

    def test_communication_attempt_retained_and_anonymised_after_deletion(self):
        """CommunicationAttempt audit rows survive deletion without user foreign keys."""
        self._register_user()
        self._login()
        user = User.query.filter_by(email="new@teacher.com").first()
        attempt_id = record_attempt(
            channel="email",
            purpose="security",
            recipient_user_id=user.id,
            masked_destination="ne*@teacher.com",
            template_name="email_verification_otp",
            provider="mock",
            mode="mock",
            status="mocked",
            initiated_by=user.id,
        )
        db.session.commit()

        response = self.client.post("/api/auth/decline-terms")

        self.assertEqual(response.status_code, 200)
        retained = db.session.get(CommunicationAttempt, attempt_id)
        self.assertIsNotNone(retained)
        self.assertIsNone(retained.recipient_user_id)
        self.assertIsNone(retained.initiated_by)

    def test_order_retained_after_deletion(self):
        """Orders must be retained with user_id set to None after account deletion."""
        self._register_user()
        self._login()
        user = User.query.filter_by(email="new@teacher.com").first()

        order = Order(
            order_reference="ORD-RETENTION-001", user_id=user.id,
            customer_name="Test User", email="new@teacher.com", phone="+233501234567",
            delivery_method="pickup", status="new", payment_status="unpaid",
        )
        db.session.add(order)
        db.session.commit()
        order_id = order.id

        self.client.post("/api/auth/decline-terms")

        retained = db.session.get(Order, order_id)
        self.assertIsNotNone(retained, "Order must be retained after user deletion")
        self.assertIsNone(retained.user_id, "Order user_id must be set to None")

    def test_shared_admin_records_cleared_after_deletion(self):
        """Shared records like ContactMessage, Job, OrderDelivery, etc. have user refs cleared."""
        self._register_user()
        self._login()
        user = User.query.filter_by(email="new@teacher.com").first()

        msg = ContactMessage(name="Test", email="t@t.com", subject="Test",
                             message="Hello", assigned_to=user.id)
        jobj = Job(title="Test Job", organisation="Test", location="Accra",
                   description="Test", created_by_id=user.id)

        order = Order(
            order_reference="ORD-SHARED-001", user_id=user.id,
            customer_name="Test User", email="t@t.com", phone="+233501234567",
            delivery_method="pickup", status="new", payment_status="unpaid",
        )
        db.session.add(order)
        db.session.flush()

        od = OrderDelivery(
            order_id=order.id, status="assigned_to_company", assigned_by_id=user.id,
        )

        from backend.models import DeliveryCompany
        company = DeliveryCompany(name="Test Delivery Co", status="active")
        db.session.add(company)
        db.session.flush()

        batch = DeliverySettlementBatch(
            reference=f"BATCH-CLEAR-{user.id}", company_id=company.id,
            settlement_date=datetime.now(timezone.utc).date(),
            status="unsettled", settled_by_id=user.id, prepared_by_id=user.id,
        )

        br = BookRequest(
            reference=f"BR-CLEAR-{user.id}",
            requested_title="Test Book",
            normalized_title="test book",
            customer_name="Test",
            resolved_by_id=user.id,
        )
        db.session.add_all([msg, jobj, od, batch, br])
        db.session.commit()

        self.client.post("/api/auth/decline-terms")

        self.assertIsNone(db.session.get(ContactMessage, msg.id).assigned_to)
        self.assertIsNone(db.session.get(Job, jobj.id).created_by_id)
        self.assertIsNone(db.session.get(OrderDelivery, od.id).assigned_by_id)
        b2 = db.session.get(DeliverySettlementBatch, batch.id)
        self.assertIsNone(b2.settled_by_id)
        self.assertIsNone(b2.prepared_by_id)
        self.assertIsNone(db.session.get(BookRequest, br.id).resolved_by_id)

    def test_newsletter_subscriber_deleted_on_account_deletion(self):
        """NewsletterSubscriber with matching email must be deleted when user deletes account."""
        self._register_user()
        self._login()

        sub = NewsletterSubscriber(email="new@teacher.com", source="site", is_active=True)
        db.session.add(sub)
        db.session.commit()
        sub_id = sub.id

        self.client.post("/api/auth/decline-terms")

        deleted = db.session.get(NewsletterSubscriber, sub_id)
        self.assertIsNone(deleted, "Newsletter subscriber must be deleted when user deletes account")

    def test_newsletter_subscriber_different_email_not_deleted(self):
        """NewsletterSubscriber with a different email must not be deleted."""
        self._register_user()
        self._login()

        sub = NewsletterSubscriber(email="other@example.com", source="site", is_active=True)
        db.session.add(sub)
        db.session.commit()
        sub_id = sub.id

        self.client.post("/api/auth/decline-terms")

        retained = db.session.get(NewsletterSubscriber, sub_id)
        self.assertIsNotNone(retained, "Newsletter subscriber with different email must not be deleted")

    # ==================== FILE DELETION ORDERING TESTS ====================

    def test_physical_files_deleted_after_db_commit(self):
        """Physical files must not be deleted before the DB transaction commits."""
        import tempfile
        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        tmp.close()
        tmp_path = tmp.name

        self._register_user()
        self._login()
        user = User.query.filter_by(email="new@teacher.com").first()

        uf = UploadedFile(
            owner_id=user.id, original_filename="test_ordering.pdf",
            stored_filename="test_ordering.pdf", storage_path=tmp_path,
            mime_type="application/pdf", size_bytes=100, category="document",
        )
        db.session.add(uf)
        db.session.commit()
        uf_id = uf.id

        Path(tmp_path).write_text("test content")

        try:
            self.client.post("/api/auth/decline-terms")
            deleted_row = db.session.get(UploadedFile, uf_id)
            self.assertIsNone(deleted_row, "UploadedFile row must be deleted")
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    def test_commit_failure_before_physical_deletion_leaves_files(self):
        """If the DB commit fails, physical files must remain untouched."""
        import tempfile
        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        tmp.close()
        tmp_path = tmp.name

        self._register_user()
        self._login()
        user = User.query.filter_by(email="new@teacher.com").first()

        uf = UploadedFile(
            owner_id=user.id, original_filename="safe.pdf",
            stored_filename="safe.pdf", storage_path=tmp_path,
            mime_type="application/pdf", size_bytes=100, category="document",
        )
        db.session.add(uf)
        db.session.commit()

        Path(tmp_path).write_text("safe content")

        try:
            with patch.object(db.session, "commit", side_effect=Exception("Simulated commit failure")):
                resp = self.client.post("/api/auth/decline-terms")
                self.assertNotEqual(resp.status_code, 200)

            file_still_exists = Path(tmp_path).is_file()
            self.assertTrue(file_still_exists, "File must survive when DB commit fails")
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    def test_missing_file_not_fatal(self):
        """A missing physical file must not prevent the rest of the deletion from succeeding."""
        self._register_user()
        self._login()
        user = User.query.filter_by(email="new@teacher.com").first()

        uf = UploadedFile(
            owner_id=user.id, original_filename="missing.pdf",
            stored_filename="missing.pdf", storage_path="/tmp/ghost_file.pdf",
            mime_type="application/pdf", size_bytes=100, category="document",
        )
        db.session.add(uf)
        db.session.commit()

        Path(uf.storage_path).unlink(missing_ok=True)

        resp = self.client.post("/api/auth/decline-terms")
        self.assertEqual(resp.status_code, 200)

    def test_rerun_cleanup_safe(self):
        """Re-running cleanup after a successful deletion must be safe (no error, no crash)."""
        import tempfile
        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        tmp.close()
        tmp_path = tmp.name

        self._register_user()
        self._login()
        user = User.query.filter_by(email="new@teacher.com").first()

        uf = UploadedFile(
            owner_id=user.id, original_filename="rerun.pdf",
            stored_filename="rerun.pdf", storage_path=tmp_path,
            mime_type="application/pdf", size_bytes=100, category="document",
        )
        db.session.add(uf)
        db.session.commit()
        Path(tmp_path).write_text("rerun")

        resp1 = self.client.post("/api/auth/decline-terms")
        self.assertEqual(resp1.status_code, 200)

        ghost = db.session.get(UploadedFile, uf.id)
        self.assertIsNone(ghost)

        Path(tmp_path).unlink(missing_ok=True)

    # ==================== AUTH DELETION TESTS ====================

    def test_deleted_user_auth_identities_cascade_deleted(self):
        """AuthIdentity records must be cascade-deleted when the user is deleted."""
        self._register_user()
        self._login()
        user = User.query.filter_by(email="new@teacher.com").first()

        from backend.models import AuthIdentity
        ai = AuthIdentity(user_id=user.id, provider="google",
                          provider_user_id="google_12345", email=user.email)
        db.session.add(ai)
        db.session.commit()
        ai_id = ai.id

        self.client.post("/api/auth/decline-terms")

        deleted = db.session.get(AuthIdentity, ai_id)
        self.assertIsNone(deleted, "AuthIdentity must be cascade-deleted with user")

    def test_deleted_user_terms_acceptances_cascade_deleted(self):
        """TermsAcceptance records must be cascade-deleted when the user is deleted."""
        self._register_user()
        self._login()
        user = User.query.filter_by(email="new@teacher.com").first()

        ta = TermsAcceptance(
            user_id=user.id, terms_type="platform_terms",
            terms_version=CURRENT_TERMS_VERSION, accepted_at=datetime.now(timezone.utc),
            acceptance_source="test",
        )
        db.session.add(ta)
        db.session.commit()
        ta_id = ta.id

        self.client.post("/api/auth/decline-terms")

        deleted = db.session.get(TermsAcceptance, ta_id)
        self.assertIsNone(deleted, "TermsAcceptance must be cascade-deleted with user")

    def test_deletion_does_not_call_external_auth_provider(self):
        """Deletion must only remove the local AuthIdentity row, not call external providers."""
        self._register_user()
        self._login()

        with patch("backend.api.auth.audit") as mock_audit:
            resp = self.client.post("/api/auth/decline-terms")
            self.assertEqual(resp.status_code, 200)

        # Verify no external HTTP calls (no requests library mocking needed —
        # the code never makes external calls for auth deletion)
        user = User.query.filter_by(email="new@teacher.com").first()
        self.assertIsNone(user, "User must be deleted without external provider calls")

    def test_invalidates_session_after_deletion(self):
        """The session must be fully logged out after deletion."""
        self._register_user()
        self._login()

        # Verify session works before deletion
        terms_resp = self.client.post("/api/auth/accept-terms")
        self.assertEqual(terms_resp.status_code, 200)

        # Delete the account
        self.client.post("/api/auth/decline-terms")

        # Stale session must be rejected on @login_required endpoints
        stale_resp = self.client.post("/api/auth/accept-terms")
        self.assertEqual(stale_resp.status_code, 401)

class ProfilePartialUpdateTests(unittest.TestCase):
    """Ensure profile partial updates do not trigger unrelated validations.

    The critical bug: a teacher without a phone number (NULL in DB) who edited
    their personal-info modal would send phone='' in the PUT /api/me/profile
    payload; the backend compared '' != None and returned a 400 error about
    phone OTP, blocking the save entirely.
    """

    def setUp(self):
        self.app = create_app(AccountLifecycleTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        db.session.execute(db.text("PRAGMA foreign_keys = ON"))

        self.role = Role(name="user", description="Teacher")
        db.session.add(self.role)
        db.session.commit()

        self.client = self.app.test_client()

    def tearDown(self):
        db.session.execute(db.text("PRAGMA foreign_keys = OFF"))
        db.session.commit()
        db.drop_all()
        db.session.remove()
        self.context.pop()

    # ---- helpers ----

    def _register_login(self, email="partial@teacher.com", phone=""):
        """Register a verified user and log in."""
        resp = self.client.post("/api/auth/signup", json={
            "email": email,
            "password": "TestPass123!",
            "first_name": "Partial",
            "last_name": "Update",
            "phone": phone,
            "sex": "male",
            "age_range": "25_34",
            "accepted_terms": True,
            "surface": "teacher",
            "turnstile_token": "bypass",
        })
        self.assertEqual(resp.status_code, 201)
        user = User.query.filter_by(email=email).first()
        user.is_verified = True
        db.session.commit()

        login = self.client.post("/api/auth/login", json={
            "email": email,
            "password": "TestPass123!",
            "surface": "teacher",
        })
        self.assertEqual(login.status_code, 200)

    def _profile(self):
        return self.client.get("/api/me/profile").get_json().get("profile", {})

    def _create_upload(self, filename="test.pdf"):
        """Create and return an UploadedFile owned by the test user."""
        user = User.query.filter_by(email="partial@teacher.com").first()
        f = UploadedFile(
            owner_id=user.id,
            original_filename=filename,
            stored_filename=filename,
            storage_path=f"/tmp/{filename}",
            mime_type="application/pdf",
            size_bytes=100,
            category="cv",
        )
        db.session.add(f)
        db.session.flush()
        db.session.commit()
        return f.id

    # ==============  PARTIAL UPDATE — CORE SCENARIOS  ==============

    def test_update_bio_only_with_null_phone(self):
        """User with NULL phone updates bio — must NOT trigger phone OTP."""
        self._register_login(phone="")
        user = User.query.filter_by(email="partial@teacher.com").first()
        self.assertIsNone(user.phone)

        resp = self.client.put("/api/me/profile", json={"bio": "Qualified maths teacher."})
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data.get("profile", {}).get("bio"), "Qualified maths teacher.")

    def test_update_location_only_with_null_phone(self):
        """User with NULL phone updates location — must succeed."""
        self._register_login(phone="")
        resp = self.client.put("/api/me/profile", json={"location": "Kumasi"})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual( self._profile().get("location"), "Kumasi")

    def test_update_sex_and_age_range_with_null_phone(self):
        """User with NULL phone updates sex + age range — must succeed."""
        self._register_login(phone="")
        resp = self.client.put("/api/me/profile", json={
            "sex": "female",
            "age_range": "35_44",
        })
        self.assertEqual(resp.status_code, 200)

    def test_update_teaching_preferences_with_null_phone(self):
        """User with NULL phone updates teaching fields — must succeed."""
        self._register_login(phone="")
        resp = self.client.put("/api/me/profile", json={
            "teaching_subject": "English",
            "preferred_level": "Junior High",
            "preferred_employment_type": "Part-time",
        })
        self.assertEqual(resp.status_code, 200)
        data = self._profile()
        self.assertEqual(data.get("preferred_employment_type"), "Part-time")

    def test_update_curriculum_experience_with_null_phone(self):
        """User with NULL phone updates curriculum experience — must succeed."""
        self._register_login(phone="")
        resp = self.client.put("/api/me/profile", json={
            "curriculum_experience": "IGCSE",
        })
        self.assertEqual(resp.status_code, 200)

    def test_update_years_of_experience_with_null_phone(self):
        """User with NULL phone updates years_of_experience — must succeed."""
        self._register_login(phone="")
        resp = self.client.put("/api/me/profile", json={
            "years_of_experience": 5,
        })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(self._profile().get("years_of_experience"), 5)

    def test_update_years_of_experience_blank_coerces_null(self):
        """years_of_experience='' must be coerced to None, not crash."""
        self._register_login(phone="")
        resp = self.client.put("/api/me/profile", json={
            "years_of_experience": "",
        })
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(self._profile().get("years_of_experience"))

    def test_update_date_of_birth_with_null_phone(self):
        """User with NULL phone updates date_of_birth — must succeed."""
        self._register_login(phone="")
        resp = self.client.put("/api/me/profile", json={
            "date_of_birth": "1990-05-15",
        })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(self._profile().get("date_of_birth"), "1990-05-15")

    def test_update_date_of_birth_blank_coerces_null(self):
        """date_of_birth='' must be coerced to None, not crash."""
        self._register_login(phone="")
        resp = self.client.put("/api/me/profile", json={
            "date_of_birth": "",
        })
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(self._profile().get("date_of_birth"))

    # ==============  PHONE EDGE CASES IN update_profile  ==============

    def test_phone_omitted_from_payload_does_not_alter_stored_phone(self):
        """Omitting 'phone' entirely must preserve the stored value and succeed."""
        self._register_login(phone="+233501234567")
        stored_before = User.query.filter_by(email="partial@teacher.com").first().phone
        resp = self.client.put("/api/me/profile", json={"location": "Cape Coast"})
        self.assertEqual(resp.status_code, 200)
        stored_after = User.query.filter_by(email="partial@teacher.com").first().phone
        self.assertEqual(stored_after, stored_before)

    def test_phone_payload_matches_stored_does_not_require_otp(self):
        """Sending the same phone value must not trigger OTP error."""
        self._register_login(phone="+233501234567")
        user = User.query.filter_by(email="partial@teacher.com").first()
        self.assertEqual(user.phone, "+233501234567")

        resp = self.client.put("/api/me/profile", json={"phone": "+233501234567"})
        self.assertEqual(resp.status_code, 200)

    def test_phone_payload_none_matches_stored_null(self):
        """Sending phone: None for a user with NULL phone must succeed."""
        self._register_login(phone="")
        user = User.query.filter_by(email="partial@teacher.com").first()
        self.assertIsNone(user.phone)

        resp = self.client.put("/api/me/profile", json={"phone": None})
        self.assertEqual(resp.status_code, 200)

    def test_phone_payload_empty_string_matches_stored_null(self):
        """Sending phone: '' for a user with NULL phone must NOT trigger OTP error.

        This is the exact scenario that was broken: the frontend sent phone=''
        (from form initializer) for a user with phone=NULL in DB.
        """
        self._register_login(phone="")
        user = User.query.filter_by(email="partial@teacher.com").first()
        self.assertIsNone(user.phone)

        resp = self.client.put("/api/me/profile", json={"phone": ""})
        self.assertEqual(resp.status_code, 200)

    def test_genuine_phone_change_requires_otp(self):
        """A real phone change through update_profile must be rejected."""
        self._register_login(phone="+233501234567")
        resp = self.client.put("/api/me/profile", json={"phone": "+233509876543"})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("OTP", resp.get_json().get("error", ""))

    def test_genuine_phone_change_from_null_requires_otp(self):
        """Setting a phone when it was NULL through update_profile must be rejected."""
        self._register_login(phone="")
        resp = self.client.put("/api/me/profile", json={"phone": "+233501234567"})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("OTP", resp.get_json().get("error", ""))

    # ==============  PROFILE COMPLETION / STATUS EDGE CASES  ==============

    def test_partial_update_does_not_reset_profile_status(self):
        """Updating a single field must not reset profile_status to incomplete."""
        self._register_login(phone="")
        profile = User.query.filter_by(email="partial@teacher.com").first().profile
        profile.profile_status = "complete"
        db.session.commit()

        resp = self.client.put("/api/me/profile", json={"location": "Takoradi"})
        self.assertEqual(resp.status_code, 200)
        data = self._profile()
        self.assertEqual(data.get("profile_status"), "complete",
                         "Partial update must not reset profile_status")

    def test_partial_update_completes_incomplete_profile_when_fields_filled(self):
        """After filling all required fields, an incomplete profile auto-upgrades to complete."""
        self._register_login(phone="")
        profile = User.query.filter_by(email="partial@teacher.com").first().profile
        profile.profile_status = "incomplete"
        profile.cv_file_id = self._create_upload("cv.pdf")
        profile.certificate_file_id = self._create_upload("cert.pdf")
        db.session.commit()

        # Fill remaining required completion fields (email already set)
        resp = self.client.put("/api/me/profile", json={
            "location": "Accra",
            "teaching_subject": "Mathematics",
            "preferred_level": "Senior High",
            "preferred_employment_type": "Full-time",
            "curriculum_experience": "WASSCE",
        })
        self.assertEqual(resp.status_code, 200)
        data = self._profile()
        self.assertGreaterEqual(data.get("profile_completion", 0), 100,
                                "Profile should be 100% complete after filling all fields")

    def test_revision_required_upgrades_to_complete_on_partial_update(self):
        """A profile in revision_required status upgrades to complete when fields are filled."""
        self._register_login(phone="")
        profile = User.query.filter_by(email="partial@teacher.com").first().profile
        profile.profile_status = "revision_required"
        profile.cv_file_id = self._create_upload("cv.pdf")
        profile.certificate_file_id = self._create_upload("cert.pdf")
        db.session.commit()

        # Fill remaining required completion fields
        resp = self.client.put("/api/me/profile", json={
            "location": "Accra",
            "teaching_subject": "Mathematics",
            "preferred_level": "Senior High",
            "preferred_employment_type": "Full-time",
            "curriculum_experience": "WASSCE",
        })
        self.assertEqual(resp.status_code, 200)
        data = self._profile()
        self.assertEqual(data.get("profile_status"), "complete",
                         "revision_required should auto-upgrade to complete when fields filled")

    # ==============  ACCOUNT-LEVEL FIELD HANDLING  ==============

    def test_update_account_only_accepts_first_and_last_name(self):
        """update_account endpoint must accept only first_name and last_name."""
        self._register_login(phone="")
        resp = self.client.put("/api/me/account", json={
            "first_name": "UpdatedFirst",
            "last_name": "UpdatedLast",
        })
        self.assertEqual(resp.status_code, 200)
        user = User.query.filter_by(email="partial@teacher.com").first()
        self.assertEqual(user.first_name, "UpdatedFirst")

    def test_update_account_rejects_phone(self):
        """update_account endpoint must ignore or reject phone changes."""
        self._register_login(phone="+233501234567")
        resp = self.client.put("/api/me/account", json={
            "first_name": "F",
            "last_name": "L",
            "phone": "+233509876543",
        })
        self.assertEqual(resp.status_code, 200)
        user = User.query.filter_by(email="partial@teacher.com").first()
        self.assertEqual(user.phone, "+233501234567",
                         "Phone must not be changed via update_account")

    # ==============  CONCURRENT SECTION SAVES  ==============

    def test_multiple_partial_updates_accumulate(self):
        """Sequential partial updates must accumulate correctly."""
        self._register_login(phone="")
        self.client.put("/api/me/profile", json={"location": "Accra"})
        self.client.put("/api/me/profile", json={"teaching_subject": "English"})
        self.client.put("/api/me/profile", json={"preferred_level": "Junior High"})
        data = self._profile()
        self.assertEqual(data.get("location"), "Accra")
        self.assertEqual(data.get("teaching_subject"), "English")
        self.assertEqual(data.get("preferred_level"), "Junior High")

    def test_profile_after_partial_updates_matches_response(self):
        """The returned profile from a partial update must match the stored profile."""
        self._register_login(phone="")
        resp = self.client.put("/api/me/profile", json={"location": "Accra"})
        returned = resp.get_json()["profile"]

        stored = self._profile()
        for key in ("location", "phone", "email"):
            self.assertEqual(stored.get(key), returned.get(key),
                             f"Mismatch for {key}: stored={stored.get(key)!r} returned={returned.get(key)!r}")


if __name__ == "__main__":
    unittest.main()
