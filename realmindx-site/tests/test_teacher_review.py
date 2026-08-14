import io
import os
import sys
import tempfile
import unittest
from pathlib import Path
from datetime import datetime, timezone
from unittest.mock import patch

SITE_ROOT = Path(__file__).resolve().parents[1]
if str(SITE_ROOT) not in sys.path:
    sys.path.insert(0, str(SITE_ROOT))

from backend import create_app
from backend.communications import CommunicationResult
from backend.config import Config
from backend.extensions import db
from backend.models import AuditLog, Permission, Role, UploadedFile, User, UserProfile
from backend.teacher_ids import generate_application_id


class TeacherReviewTestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    SECRET_KEY = "teacher-review-tests"
    BASE_URL = "http://localhost"
    BOOKSHOP_URL = "http://bookshop.localhost"
    CORS_ORIGINS = ["http://localhost", "http://bookshop.localhost"]
    RATELIMIT_ENABLED = False
    WTF_CSRF_ENABLED = False
    TURNSTILE_SECRET_KEY = ""


def _make_submitted_teacher(session, email_suffix="1", teacher_service_enabled=True):
    role = Role.query.filter_by(name="user").one()
    teacher = User(
        email=f"teacher-{email_suffix}@example.com",
        first_name="Test",
        last_name="Teacher",
        role=role,
        is_active=True,
        is_verified=True,
        teacher_service_enabled=teacher_service_enabled,
        application_id=generate_application_id(),
    )
    teacher.set_password("TeacherPassword1!")
    session.add(teacher)
    session.flush()
    profile = UserProfile(user_id=teacher.id)
    profile.location = "Accra"
    profile.teaching_subject = "Mathematics"
    profile.preferred_level = "Senior High"
    profile.preferred_employment_type = "Full-time"
    profile.curriculum_experience = "WASSCE"
    profile.profile_status = "submitted"
    profile.submitted_at = datetime.now(timezone.utc)
    cv = UploadedFile(
        owner_id=teacher.id, original_filename="cv.pdf", stored_filename="cv_stored.pdf",
        storage_path="/tmp/cv.pdf", mime_type="application/pdf", size_bytes=100, category="cv",
    )
    cert = UploadedFile(
        owner_id=teacher.id, original_filename="cert.pdf", stored_filename="cert_stored.pdf",
        storage_path="/tmp/cert.pdf", mime_type="application/pdf", size_bytes=100, category="certificate",
    )
    session.add_all([profile, cv, cert])
    session.flush()
    profile.cv_file_id = cv.id
    profile.certificate_file_id = cert.id
    session.commit()
    return teacher, profile


def _make_admin(session, email="admin@example.com"):
    role = Role.query.filter_by(name="admin").one()
    admin = User(email=email, first_name="Admin", last_name="User", role=role, is_active=True, is_verified=True)
    admin.set_password("AdminPassword123!")
    session.add(admin)
    session.commit()
    return admin


class TeacherReviewTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(TeacherReviewTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        db.session.execute(db.text("PRAGMA foreign_keys = ON"))

        admin_role = Role(name="admin", description="Admin")
        teacher_role = Role(name="user", description="Teacher")
        staff_role = Role(name="staff", description="Staff")
        db.session.add_all([admin_role, teacher_role, staff_role])
        db.session.commit()

        self.teacher_role = teacher_role
        self.admin_user = _make_admin(db.session)
        self.client = self.app.test_client()

    def _login_admin(self):
        resp = self.client.post("/api/auth/login", json={
            "email": self.admin_user.email, "password": "AdminPassword123!",
        })
        self.assertEqual(resp.status_code, 200)

    def _login_as(self, email, password):
        resp = self.client.post("/api/auth/login", json={"email": email, "password": password})
        self.assertEqual(resp.status_code, 200)

    def tearDown(self):
        db.session.remove()
        db.session.execute(db.text("PRAGMA foreign_keys = OFF"))
        db.session.commit()
        db.drop_all()
        self.context.pop()

    # -- authorization --

    def test_teacher_cannot_access_review_queue(self):
        teacher, _ = _make_submitted_teacher(db.session, "auth1")
        self._login_as("teacher-auth1@example.com", "TeacherPassword1!")
        resp = self.client.get("/api/admin/teachers/review")
        self.assertEqual(resp.status_code, 403)

    def test_teacher_cannot_start_review(self):
        teacher, _ = _make_submitted_teacher(db.session, "auth2")
        self._login_as("teacher-auth2@example.com", "TeacherPassword1!")
        resp = self.client.post(f"/api/admin/teachers/{teacher.id}/start-review")
        self.assertEqual(resp.status_code, 403)

    def test_teacher_cannot_verify(self):
        teacher, _ = _make_submitted_teacher(db.session, "auth3")
        self._login_as("teacher-auth3@example.com", "TeacherPassword1!")
        resp = self.client.post(f"/api/admin/teachers/{teacher.id}/verify", json={
            "required_documents_present": True, "documents_readable": True,
            "identity_details_consistent": True, "qualifications_consistent": True,
            "teaching_details_consistent": True, "no_obvious_alteration_detected": True,
        })
        self.assertEqual(resp.status_code, 403)

    def test_staff_account_override_records_staff_actor_and_reason(self):
        teacher, _ = _make_submitted_teacher(db.session, "staff-override")
        staff_role = Role.query.filter_by(name="staff").one()
        permission = Permission(key="teachers.account.manage", description="Manage teacher accounts")
        db.session.add(permission)
        staff_role.permissions.append(permission)
        staff = User(email="staff-override@example.com", first_name="Staff", last_name="Operator", role=staff_role, is_active=True, is_verified=True)
        staff.set_password("StaffPassword1!")
        db.session.add(staff)
        db.session.commit()
        self._login_as(staff.email, "StaffPassword1!")
        response = self.client.patch(f"/api/admin/teachers/{teacher.id}/account", json={
            "first_name": "Corrected", "reason": "Teacher supplied corrected legal name",
        })
        self.assertEqual(response.status_code, 200)
        event = AuditLog.query.filter_by(action="teacher_account_admin_updated", actor_id=staff.id).one()
        self.assertEqual(event.details["reason"], "Teacher supplied corrected legal name")
        self.assertIn("first_name", event.details["changed_fields"])

    def test_admin_verification_override_is_system_valid_and_audited(self):
        teacher, _ = _make_submitted_teacher(db.session, "verify-override")
        teacher.is_verified = False
        teacher.phone_verified = False
        db.session.commit()
        self._login_admin()
        response = self.client.patch(f"/api/admin/teachers/{teacher.id}/verification", json={
            "email_verified": True, "phone_verified": True, "reason": "Verified against original records",
        })
        self.assertEqual(response.status_code, 200)
        db.session.refresh(teacher)
        self.assertTrue(teacher.is_verified)
        self.assertTrue(teacher.phone_verified)
        self.assertIsNotNone(teacher.phone_verified_at)
        self.assertIsNotNone(AuditLog.query.filter_by(action="teacher_verification_admin_updated", actor_id=self.admin_user.id).first())

    def test_document_preview_is_inline_and_download_is_attachment(self):
        teacher, profile = _make_submitted_teacher(db.session, "preview")
        handle = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
        handle.write(b"%PDF-1.4\n%%EOF")
        handle.close()
        self.addCleanup(lambda: os.path.exists(handle.name) and os.remove(handle.name))
        uploaded = db.session.get(UploadedFile, profile.cv_file_id)
        uploaded.storage_path = handle.name
        uploaded.original_filename = "teacher-cv.pdf"
        db.session.commit()
        self._login_admin()
        preview = self.client.get(f"/api/files/{uploaded.id}/preview")
        download = self.client.get(f"/api/files/{uploaded.id}/download")
        self.assertEqual(preview.status_code, 200)
        self.assertIn("inline", preview.headers.get("Content-Disposition", ""))
        self.assertEqual(preview.headers.get("X-Frame-Options"), "SAMEORIGIN")
        self.assertIn("attachment", download.headers.get("Content-Disposition", ""))

    def test_unauthorised_staff_cannot_review(self):
        staff_role = Role.query.filter_by(name="staff").one()
        staff = User(email="staff@example.com", first_name="Staff", last_name="User", role=staff_role, is_active=True, is_verified=True)
        staff.set_password("StaffPassword1!")
        db.session.add(staff)
        db.session.commit()
        self._login_as("staff@example.com", "StaffPassword1!")
        teacher, _ = _make_submitted_teacher(db.session, "auth4")
        resp = self.client.get("/api/admin/teachers/review")
        self.assertEqual(resp.status_code, 403)

    def test_staff_with_teachers_edit_perm_can_start_review(self):
        staff_role = Role.query.filter_by(name="staff").one()
        perm = Permission(key="teachers.edit", description="Can edit teachers")
        db.session.add(perm)
        db.session.flush()
        staff_role.permissions.append(perm)
        staff = User(email="staff-reviewer@example.com", first_name="Staff", last_name="Reviewer", role=staff_role, is_active=True, is_verified=True)
        staff.set_password("StaffPassword1!")
        db.session.add(staff)
        db.session.commit()
        self._login_as("staff-reviewer@example.com", "StaffPassword1!")
        teacher, _ = _make_submitted_teacher(db.session, "auth5")
        resp = self.client.post(f"/api/admin/teachers/{teacher.id}/start-review")
        self.assertEqual(resp.status_code, 200)

    def test_admin_can_access_review_queue(self):
        _make_submitted_teacher(db.session, "q1")
        self._login_admin()
        resp = self.client.get("/api/admin/teachers/review")
        self.assertEqual(resp.status_code, 200)

    # -- review queue --

    def test_review_queue_shows_submitted_profiles(self):
        teacher, _ = _make_submitted_teacher(db.session, "q2")
        self._login_admin()
        resp = self.client.get("/api/admin/teachers/review")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        ids = [item["id"] for item in data["items"]]
        self.assertIn(teacher.id, ids)

    def test_review_queue_excludes_non_teacher_users(self):
        _make_submitted_teacher(db.session, "q3")
        customer = User(email="customer@example.com", first_name="Customer", last_name="User",
                        role=self.teacher_role, is_active=True, is_verified=True, teacher_service_enabled=False)
        customer.set_password("Pass123!")
        db.session.add(customer)
        db.session.commit()
        self._login_admin()
        resp = self.client.get("/api/admin/teachers/review")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        ids = [item["id"] for item in data["items"]]
        self.assertNotIn(customer.id, ids)

    def test_review_queue_status_filter(self):
        t1, p1 = _make_submitted_teacher(db.session, "f1")
        p1.profile_status = "under_review"
        p1.reviewed_by_id = self.admin_user.id
        p1.reviewed_at = datetime.now(timezone.utc)
        t2, p2 = _make_submitted_teacher(db.session, "f2")
        db.session.commit()
        self._login_admin()
        resp = self.client.get("/api/admin/teachers/review?status=submitted")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        ids = [item["id"] for item in data["items"]]
        self.assertIn(t2.id, ids)
        self.assertNotIn(t1.id, ids)

    def test_review_queue_combines_subject_and_curriculum_filters(self):
        mathematics, mathematics_profile = _make_submitted_teacher(db.session, "taxonomy-math")
        mathematics_profile.teaching_subject = "Mathematics, Integrated Science"
        mathematics_profile.curriculum_experience = "WASSCE"
        physics, physics_profile = _make_submitted_teacher(db.session, "taxonomy-physics")
        physics_profile.teaching_subject = "Physics"
        physics_profile.curriculum_experience = "Cambridge International Curriculum"
        chemistry, chemistry_profile = _make_submitted_teacher(db.session, "taxonomy-chemistry")
        chemistry_profile.teaching_subject = "Chemistry"
        chemistry_profile.curriculum_experience = "WASSCE"
        db.session.commit()
        self._login_admin()

        response = self.client.get(
            "/api/admin/teachers/review"
            "?subject=Mathematics&subject=Physics&curriculum=Cambridge%20International%20Curriculum"
        )

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        ids = {item["id"] for item in data["items"]}
        self.assertEqual(ids, {physics.id})
        self.assertEqual(data["items"][0]["curriculum_experience"], "Cambridge International Curriculum")
        self.assertNotIn(mathematics.id, ids)
        self.assertNotIn(chemistry.id, ids)

    def test_review_queue_subject_filter_matches_complete_list_tokens(self):
        teacher, profile = _make_submitted_teacher(db.session, "taxonomy-exact")
        profile.teaching_subject = "Integrated Science"
        db.session.commit()
        self._login_admin()

        response = self.client.get("/api/admin/teachers/review?subject=Science")

        self.assertEqual(response.status_code, 200)
        self.assertNotIn(teacher.id, {item["id"] for item in response.get_json()["items"]})

    def test_review_queue_location_filter_is_case_insensitive_and_combines_with_subject(self):
        accra_teacher, accra_profile = _make_submitted_teacher(db.session, "location-accra")
        accra_profile.location = "East Legon, Accra"
        accra_profile.teaching_subject = "Mathematics"
        preferred_accra_teacher, preferred_accra_profile = _make_submitted_teacher(db.session, "preferred-location-accra")
        preferred_accra_profile.location = "Tamale"
        preferred_accra_profile.preferred_locations = "Tema, Accra"
        preferred_accra_profile.teaching_subject = "Mathematics"
        kumasi_teacher, kumasi_profile = _make_submitted_teacher(db.session, "location-kumasi")
        kumasi_profile.location = "Adum, Kumasi"
        kumasi_profile.preferred_locations = "Sunyani"
        kumasi_profile.teaching_subject = "Mathematics"
        db.session.commit()
        self._login_admin()

        response = self.client.get("/api/admin/teachers/review?subject=Mathematics&location=accra")

        self.assertEqual(response.status_code, 200)
        ids = {item["id"] for item in response.get_json()["items"]}
        self.assertIn(accra_teacher.id, ids)
        self.assertIn(preferred_accra_teacher.id, ids)
        self.assertNotIn(kumasi_teacher.id, ids)

    def test_review_queue_search_by_application_id(self):
        teacher, _ = _make_submitted_teacher(db.session, "srch1")
        self._login_admin()
        resp = self.client.get(f"/api/admin/teachers/review?search={teacher.application_id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        ids = [item["id"] for item in data["items"]]
        self.assertIn(teacher.id, ids)

    def test_review_queue_search_by_name(self):
        teacher, _ = _make_submitted_teacher(db.session, "srch2")
        self._login_admin()
        resp = self.client.get("/api/admin/teachers/review?search=Test")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        ids = [item["id"] for item in data["items"]]
        self.assertIn(teacher.id, ids)

    def test_review_queue_search_by_email(self):
        teacher, _ = _make_submitted_teacher(db.session, "srch3")
        self._login_admin()
        resp = self.client.get("/api/admin/teachers/review?search=teacher-srch3")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        ids = [item["id"] for item in data["items"]]
        self.assertIn(teacher.id, ids)

    def test_review_queue_excludes_protected_paths(self):
        _make_submitted_teacher(db.session, "qp1")
        self._login_admin()
        resp = self.client.get("/api/admin/teachers/review")
        data = resp.get_json()
        item = data["items"][0]
        self.assertIsNone(item.get("storage_path"))
        self.assertIsNone(item.get("cv_url"))
        self.assertIsNone(item.get("certificate_url"))

    # -- review detail --

    def test_review_detail_includes_document_urls(self):
        teacher, _ = _make_submitted_teacher(db.session, "det1")
        self._login_admin()
        resp = self.client.get(f"/api/admin/teachers/{teacher.id}/review")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIn("review", data)
        self.assertIsNotNone(data["review"]["cv_url"])
        self.assertIsNotNone(data["review"]["certificate_url"])
        self.assertIsNotNone(data["review"]["cv_filename"])
        self.assertIsNotNone(data["review"]["certificate_filename"])

    # -- start review --

    def test_start_review_transitions_to_under_review(self):
        teacher, _ = _make_submitted_teacher(db.session, "sr1")
        self._login_admin()
        resp = self.client.post(f"/api/admin/teachers/{teacher.id}/start-review")
        self.assertEqual(resp.status_code, 200)
        db.session.refresh(teacher)
        self.assertEqual(teacher.profile.profile_status, "under_review")
        self.assertEqual(teacher.profile.reviewed_by_id, self.admin_user.id)

    def test_start_review_creates_audit_event(self):
        teacher, _ = _make_submitted_teacher(db.session, "sr2")
        self._login_admin()
        self.client.post(f"/api/admin/teachers/{teacher.id}/start-review")
        audit_entries = AuditLog.query.filter_by(action="teacher_profile_review_started").all()
        self.assertEqual(len(audit_entries), 1)
        self.assertEqual(audit_entries[0].actor_id, self.admin_user.id)

    def test_start_review_does_not_issue_teacher_id(self):
        teacher, _ = _make_submitted_teacher(db.session, "sr3")
        self._login_admin()
        self.client.post(f"/api/admin/teachers/{teacher.id}/start-review")
        db.session.refresh(teacher)
        self.assertIsNone(teacher.teacher_id)

    def test_start_review_idempotent(self):
        teacher, _ = _make_submitted_teacher(db.session, "sr4")
        self._login_admin()
        resp1 = self.client.post(f"/api/admin/teachers/{teacher.id}/start-review")
        self.assertEqual(resp1.status_code, 200)
        resp2 = self.client.post(f"/api/admin/teachers/{teacher.id}/start-review")
        self.assertEqual(resp2.status_code, 200)
        audit_entries = AuditLog.query.filter_by(action="teacher_profile_review_started").all()
        self.assertEqual(len(audit_entries), 1)

    def test_start_review_rejects_non_submitted(self):
        teacher, profile = _make_submitted_teacher(db.session, "sr5")
        profile.profile_status = "complete"
        db.session.commit()
        self._login_admin()
        resp = self.client.post(f"/api/admin/teachers/{teacher.id}/start-review")
        self.assertEqual(resp.status_code, 400)

    def test_start_review_rejects_disabled_service(self):
        teacher, _ = _make_submitted_teacher(db.session, "sr6", teacher_service_enabled=False)
        self._login_admin()
        resp = self.client.post(f"/api/admin/teachers/{teacher.id}/start-review")
        self.assertEqual(resp.status_code, 403)

    # -- revision required --

    def test_revision_required_transitions(self):
        teacher, profile = _make_submitted_teacher(db.session, "rev1")
        profile.profile_status = "under_review"
        profile.reviewed_by_id = self.admin_user.id
        db.session.commit()
        self._login_admin()
        resp = self.client.post(f"/api/admin/teachers/{teacher.id}/request-revision", json={"note": "Please update your CV."})
        self.assertEqual(resp.status_code, 200)
        db.session.refresh(profile)
        self.assertEqual(profile.profile_status, "revision_required")
        self.assertEqual(profile.review_notes, "Please update your CV.")

    def test_revision_required_rejects_empty_note(self):
        teacher, profile = _make_submitted_teacher(db.session, "rev2")
        profile.profile_status = "under_review"
        db.session.commit()
        self._login_admin()
        resp = self.client.post(f"/api/admin/teachers/{teacher.id}/request-revision", json={"note": ""})
        self.assertEqual(resp.status_code, 400)

    def test_revision_required_rejects_whitespace_note(self):
        teacher, profile = _make_submitted_teacher(db.session, "rev3")
        profile.profile_status = "under_review"
        db.session.commit()
        self._login_admin()
        resp = self.client.post(f"/api/admin/teachers/{teacher.id}/request-revision", json={"note": "   "})
        self.assertEqual(resp.status_code, 400)

    def test_revision_required_application_id_unchanged(self):
        teacher, profile = _make_submitted_teacher(db.session, "rev4")
        profile.profile_status = "under_review"
        app_id = teacher.application_id
        db.session.commit()
        self._login_admin()
        self.client.post(f"/api/admin/teachers/{teacher.id}/request-revision", json={"note": "Fix bio."})
        db.session.refresh(teacher)
        self.assertEqual(teacher.application_id, app_id)

    def test_revision_required_teacher_can_edit_afterward(self):
        teacher, profile = _make_submitted_teacher(db.session, "rev5")
        profile.profile_status = "under_review"
        db.session.commit()
        self._login_admin()
        self.client.post(f"/api/admin/teachers/{teacher.id}/request-revision", json={"note": "Fix bio."})
        self._login_as("teacher-rev5@example.com", "TeacherPassword1!")
        resp = self.client.put("/api/me/profile", json={"bio": "Updated bio"})
        self.assertEqual(resp.status_code, 200)

    def test_revision_required_teacher_can_replace_cv(self):
        teacher, profile = _make_submitted_teacher(db.session, "rev6")
        profile.profile_status = "under_review"
        db.session.commit()
        self._login_admin()
        self.client.post(f"/api/admin/teachers/{teacher.id}/request-revision", json={"note": "Upload new CV."})
        self._login_as("teacher-rev6@example.com", "TeacherPassword1!")
        resp = self.client.post("/api/me/uploads", data={
            "file": (io.BytesIO(b"%PDF-1.4\n%%EOF"), "cv_new.pdf"),
            "kind": "cv",
        }, content_type="multipart/form-data")
        self.assertEqual(resp.status_code, 201)

    def test_revision_required_review_notes_preserved_after_edit(self):
        teacher, profile = _make_submitted_teacher(db.session, "rev7")
        profile.profile_status = "under_review"
        db.session.commit()
        self._login_admin()
        self.client.post(f"/api/admin/teachers/{teacher.id}/request-revision", json={"note": "Fix location."})
        self._login_as("teacher-rev7@example.com", "TeacherPassword1!")
        self.client.put("/api/me/profile", json={"location": "Kumasi"})
        db.session.refresh(profile)
        self.assertEqual(profile.review_notes, "Fix location.")

    def test_revision_required_must_resubmit(self):
        teacher, profile = _make_submitted_teacher(db.session, "rev8")
        profile.profile_status = "under_review"
        db.session.commit()
        self._login_admin()
        self.client.post(f"/api/admin/teachers/{teacher.id}/request-revision", json={"note": "Fix bio."})
        self._login_as("teacher-rev8@example.com", "TeacherPassword1!")
        self.client.put("/api/me/profile", json={"bio": "Updated bio with requested corrections."})
        resp = self.client.post("/api/me/profile/submit")
        self.assertEqual(resp.status_code, 200)
        db.session.refresh(profile)
        self.assertEqual(profile.profile_status, "submitted")

    def test_revision_required_creates_audit_event(self):
        teacher, profile = _make_submitted_teacher(db.session, "rev9")
        profile.profile_status = "under_review"
        db.session.commit()
        self._login_admin()
        self.client.post(f"/api/admin/teachers/{teacher.id}/request-revision", json={"note": "Fix."})
        audit_entries = AuditLog.query.filter_by(action="teacher_profile_revision_requested").all()
        self.assertEqual(len(audit_entries), 1)

    def test_revision_required_still_no_teacher_id(self):
        teacher, profile = _make_submitted_teacher(db.session, "rev10")
        profile.profile_status = "under_review"
        db.session.commit()
        self._login_admin()
        self.client.post(f"/api/admin/teachers/{teacher.id}/request-revision", json={"note": "Fix."})
        db.session.refresh(teacher)
        self.assertIsNone(teacher.teacher_id)

    # -- rejection --

    def test_rejection_transitions(self):
        teacher, profile = _make_submitted_teacher(db.session, "rej1")
        profile.profile_status = "under_review"
        db.session.commit()
        self._login_admin()
        resp = self.client.post(f"/api/admin/teachers/{teacher.id}/reject", json={"reason": "Documents appear altered."})
        self.assertEqual(resp.status_code, 200)
        db.session.refresh(profile)
        self.assertEqual(profile.profile_status, "rejected")
        self.assertEqual(profile.review_notes, "Documents appear altered.")

    def test_rejection_rejects_empty_reason(self):
        teacher, profile = _make_submitted_teacher(db.session, "rej2")
        profile.profile_status = "under_review"
        db.session.commit()
        self._login_admin()
        resp = self.client.post(f"/api/admin/teachers/{teacher.id}/reject", json={"reason": ""})
        self.assertEqual(resp.status_code, 400)

    def test_rejection_application_id_unchanged(self):
        teacher, profile = _make_submitted_teacher(db.session, "rej3")
        profile.profile_status = "under_review"
        app_id = teacher.application_id
        db.session.commit()
        self._login_admin()
        self.client.post(f"/api/admin/teachers/{teacher.id}/reject", json={"reason": "Missing documents."})
        db.session.refresh(teacher)
        self.assertEqual(teacher.application_id, app_id)

    def test_rejection_teacher_id_not_issued(self):
        teacher, profile = _make_submitted_teacher(db.session, "rej4")
        profile.profile_status = "under_review"
        db.session.commit()
        self._login_admin()
        self.client.post(f"/api/admin/teachers/{teacher.id}/reject", json={"reason": "Reason."})
        db.session.refresh(teacher)
        self.assertIsNone(teacher.teacher_id)

    def test_rejection_blocks_resubmit(self):
        teacher, profile = _make_submitted_teacher(db.session, "rej5")
        profile.profile_status = "under_review"
        db.session.commit()
        self._login_admin()
        self.client.post(f"/api/admin/teachers/{teacher.id}/reject", json={"reason": "Reason."})
        self._login_as("teacher-rej5@example.com", "TeacherPassword1!")
        resp = self.client.post("/api/me/profile/submit")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("rejected", resp.get_json().get("error", "").lower())

    def test_rejection_creates_audit_event(self):
        teacher, profile = _make_submitted_teacher(db.session, "rej6")
        profile.profile_status = "under_review"
        db.session.commit()
        self._login_admin()
        self.client.post(f"/api/admin/teachers/{teacher.id}/reject", json={"reason": "Reason."})
        audit_entries = AuditLog.query.filter_by(action="teacher_profile_rejected").all()
        self.assertEqual(len(audit_entries), 1)

    # -- reopen rejected --

    def test_reopen_transitions_to_under_review(self):
        teacher, profile = _make_submitted_teacher(db.session, "rop1")
        profile.profile_status = "rejected"
        profile.review_notes = "Documents unclear."
        profile.reviewed_at = datetime.now(timezone.utc)
        profile.reviewed_by_id = self.admin_user.id
        db.session.commit()
        self._login_admin()
        resp = self.client.post(f"/api/admin/teachers/{teacher.id}/reopen-review", json={"note": "Teacher has clarified the documents."})
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        db.session.refresh(profile)
        self.assertEqual(profile.profile_status, "under_review")
        self.assertEqual(data["profile_status"], "under_review")

    def test_reopen_requires_note(self):
        teacher, profile = _make_submitted_teacher(db.session, "rop2")
        profile.profile_status = "rejected"
        db.session.commit()
        self._login_admin()
        resp = self.client.post(f"/api/admin/teachers/{teacher.id}/reopen-review", json={"note": ""})
        self.assertEqual(resp.status_code, 400)

    def test_reopen_rejects_whitespace_note(self):
        teacher, profile = _make_submitted_teacher(db.session, "rop3")
        profile.profile_status = "rejected"
        db.session.commit()
        self._login_admin()
        resp = self.client.post(f"/api/admin/teachers/{teacher.id}/reopen-review", json={"note": "   "})
        self.assertEqual(resp.status_code, 400)

    def test_reopen_application_id_unchanged(self):
        teacher, profile = _make_submitted_teacher(db.session, "rop4")
        profile.profile_status = "rejected"
        app_id = teacher.application_id
        db.session.commit()
        self._login_admin()
        resp = self.client.post(f"/api/admin/teachers/{teacher.id}/reopen-review", json={"note": "New evidence provided."})
        self.assertEqual(resp.status_code, 200)
        db.session.refresh(teacher)
        self.assertEqual(teacher.application_id, app_id)
        self.assertEqual(resp.get_json()["application_id"], app_id)

    def test_reopen_teacher_id_remains_null(self):
        teacher, profile = _make_submitted_teacher(db.session, "rop5")
        profile.profile_status = "rejected"
        db.session.commit()
        self._login_admin()
        resp = self.client.post(f"/api/admin/teachers/{teacher.id}/reopen-review", json={"note": "Reopening for review."})
        self.assertEqual(resp.status_code, 200)
        db.session.refresh(teacher)
        self.assertIsNone(teacher.teacher_id)
        self.assertIsNone(resp.get_json()["teacher_id"])

    def test_reopen_requires_rejected_status(self):
        teacher, profile = _make_submitted_teacher(db.session, "rop6")
        profile.profile_status = "submitted"
        db.session.commit()
        self._login_admin()
        resp = self.client.post(f"/api/admin/teachers/{teacher.id}/reopen-review", json={"note": "Should fail."})
        self.assertEqual(resp.status_code, 400)

    def test_reopen_requires_teacher_service_enabled(self):
        teacher, profile = _make_submitted_teacher(db.session, "rop7", teacher_service_enabled=False)
        db.session.commit()
        self._login_admin()
        resp = self.client.post(f"/api/admin/teachers/{teacher.id}/reopen-review", json={"note": "Should fail."})
        self.assertEqual(resp.status_code, 403)

    def test_reopen_records_reviewer_and_date(self):
        teacher, profile = _make_submitted_teacher(db.session, "rop8")
        profile.profile_status = "rejected"
        db.session.commit()
        self._login_admin()
        resp = self.client.post(f"/api/admin/teachers/{teacher.id}/reopen-review", json={"note": "Admin review."})
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data["reviewed_by_id"], self.admin_user.id)
        self.assertIsNotNone(data["reviewed_at"])

    def test_reopen_creates_audit_event(self):
        teacher, profile = _make_submitted_teacher(db.session, "rop9")
        profile.profile_status = "rejected"
        db.session.commit()
        self._login_admin()
        self.client.post(f"/api/admin/teachers/{teacher.id}/reopen-review", json={"note": "Reopening for audit check."})
        audit_entries = AuditLog.query.filter_by(action="teacher_profile_review_reopened").all()
        self.assertEqual(len(audit_entries), 1)

    def test_reopen_idempotent_no_duplicate_audit(self):
        teacher, profile = _make_submitted_teacher(db.session, "rop10")
        profile.profile_status = "rejected"
        db.session.commit()
        self._login_admin()
        resp1 = self.client.post(f"/api/admin/teachers/{teacher.id}/reopen-review", json={"note": "First reopen."})
        self.assertEqual(resp1.status_code, 200)
        resp2 = self.client.post(f"/api/admin/teachers/{teacher.id}/reopen-review", json={"note": "Second reopen."})
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(resp2.get_json()["profile_status"], "under_review")
        self.assertIn("already been reopened", resp2.get_json().get("message", "").lower())
        audit_entries = AuditLog.query.filter_by(action="teacher_profile_review_reopened").all()
        self.assertEqual(len(audit_entries), 1)

    def test_reopen_preserves_rejection_history(self):
        teacher, profile = _make_submitted_teacher(db.session, "rop11")
        profile.profile_status = "under_review"
        db.session.commit()
        self._login_admin()
        self.client.post(f"/api/admin/teachers/{teacher.id}/reject", json={"reason": "Original rejection reason."})
        db.session.refresh(profile)
        self.assertEqual(profile.profile_status, "rejected")
        resp = self.client.post(f"/api/admin/teachers/{teacher.id}/reopen-review", json={"note": "Reopening note."})
        self.assertEqual(resp.status_code, 200)
        audit_entries = AuditLog.query.filter_by(action="teacher_profile_review_reopened").all()
        self.assertEqual(len(audit_entries), 1)
        self.assertIn("reopening_note", audit_entries[0].details)
        original_rejection = AuditLog.query.filter_by(action="teacher_profile_rejected", entity_id=str(teacher.id)).first()
        self.assertIsNotNone(original_rejection, "Original rejection audit event should still exist")
        self.assertIn("reason", original_rejection.details)

    def test_reopen_preserves_profile_lock(self):
        teacher, profile = _make_submitted_teacher(db.session, "rop12")
        profile.profile_status = "rejected"
        db.session.commit()
        self._login_admin()
        self.client.post(f"/api/admin/teachers/{teacher.id}/reopen-review", json={"note": "Reopening."})
        db.session.refresh(profile)
        self.assertEqual(profile.profile_status, "under_review")
        self._login_as(f"teacher-rop12@example.com", "TeacherPassword1!")
        edit_resp = self.client.put("/api/me/profile", json={"first_name": "Hacked"})
        self.assertEqual(edit_resp.status_code, 423)
        upload_resp = self.client.post("/api/me/uploads", data={
            "file": (io.BytesIO(b"data"), "cv.pdf"),
            "kind": "cv",
        }, content_type="multipart/form-data")
        self.assertEqual(upload_resp.status_code, 423)

    def test_reopen_teacher_gets_403(self):
        teacher, profile = _make_submitted_teacher(db.session, "rop13")
        profile.profile_status = "rejected"
        db.session.commit()
        self._login_as(f"teacher-rop13@example.com", "TeacherPassword1!")
        resp = self.client.post(f"/api/admin/teachers/{teacher.id}/reopen-review", json={"note": "Should fail."})
        self.assertEqual(resp.status_code, 403)

    def test_reopen_readonly_staff_gets_403(self):
        teacher, profile = _make_submitted_teacher(db.session, "rop14")
        profile.profile_status = "rejected"
        db.session.commit()
        staff_role = Role.query.filter_by(name="staff").one()
        staff = User(email="staff-reopen@example.com", first_name="Staff", last_name="User", role=staff_role, is_active=True, is_verified=True)
        staff.set_password("StaffPass123!")
        db.session.add(staff)
        db.session.commit()
        self._login_as("staff-reopen@example.com", "StaffPass123!")
        resp = self.client.post(f"/api/admin/teachers/{teacher.id}/reopen-review", json={"note": "Should fail."})
        self.assertEqual(resp.status_code, 403)

    def test_reopen_then_request_revision_available(self):
        teacher, profile = _make_submitted_teacher(db.session, "rop15")
        profile.profile_status = "rejected"
        profile.review_notes = "Original rejection."
        db.session.commit()
        self._login_admin()
        reopen_resp = self.client.post(f"/api/admin/teachers/{teacher.id}/reopen-review", json={"note": "Reopening."})
        self.assertEqual(reopen_resp.status_code, 200)
        db.session.refresh(profile)
        self.assertEqual(profile.profile_status, "under_review")
        revision_resp = self.client.post(f"/api/admin/teachers/{teacher.id}/request-revision", json={"note": "Please update CV."})
        self.assertEqual(revision_resp.status_code, 200)
        db.session.refresh(profile)
        self.assertEqual(profile.profile_status, "revision_required")
        self._login_as("teacher-rop15@example.com", "TeacherPassword1!")
        edit_resp = self.client.put("/api/me/profile", json={"bio": "Updated after revision."})
        self.assertEqual(edit_resp.status_code, 200)
        db.session.refresh(profile)
        self.assertEqual(profile.review_notes, "Please update CV.")

    # -- visual verification --

    def test_verify_transitions_and_issues_teacher_id(self):
        teacher, profile = _make_submitted_teacher(db.session, "ver1")
        profile.profile_status = "under_review"
        db.session.commit()
        self._login_admin()
        resp = self.client.post(f"/api/admin/teachers/{teacher.id}/verify", json={
            "required_documents_present": True, "documents_readable": True,
            "identity_details_consistent": True, "qualifications_consistent": True,
            "teaching_details_consistent": True, "no_obvious_alteration_detected": True,
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        db.session.refresh(teacher)
        self.assertEqual(profile.profile_status, "verified")
        self.assertIsNotNone(teacher.teacher_id)
        self.assertRegex(teacher.teacher_id, r"^RMX-TCH-\d{6}$")
        self.assertEqual(data["teacher_id"], teacher.teacher_id)
        self.assertEqual(data["application_id"], teacher.application_id)

    def test_verify_rejects_missing_checklist_items(self):
        teacher, profile = _make_submitted_teacher(db.session, "ver2")
        profile.profile_status = "under_review"
        db.session.commit()
        self._login_admin()
        resp = self.client.post(f"/api/admin/teachers/{teacher.id}/verify", json={
            "required_documents_present": True, "documents_readable": True,
            "identity_details_consistent": True, "qualifications_consistent": True,
            "teaching_details_consistent": True,
        })
        self.assertEqual(resp.status_code, 400)
        self.assertIn("no_obvious_alteration_detected", resp.get_json().get("error", ""))

    def test_verify_rejects_false_checklist_item(self):
        teacher, profile = _make_submitted_teacher(db.session, "ver3")
        profile.profile_status = "under_review"
        db.session.commit()
        self._login_admin()
        resp = self.client.post(f"/api/admin/teachers/{teacher.id}/verify", json={
            "required_documents_present": True, "documents_readable": True,
            "identity_details_consistent": True, "qualifications_consistent": False,
            "teaching_details_consistent": True, "no_obvious_alteration_detected": True,
        })
        self.assertEqual(resp.status_code, 400)

    def test_verify_rejects_non_under_review(self):
        teacher, profile = _make_submitted_teacher(db.session, "ver4")
        db.session.commit()
        self._login_admin()
        resp = self.client.post(f"/api/admin/teachers/{teacher.id}/verify", json={
            "required_documents_present": True, "documents_readable": True,
            "identity_details_consistent": True, "qualifications_consistent": True,
            "teaching_details_consistent": True, "no_obvious_alteration_detected": True,
        })
        self.assertEqual(resp.status_code, 400)

    def test_verify_incomplete_profile_rejected(self):
        teacher, profile = _make_submitted_teacher(db.session, "ver5")
        profile.profile_status = "under_review"
        profile.location = None
        db.session.commit()
        self._login_admin()
        resp = self.client.post(f"/api/admin/teachers/{teacher.id}/verify", json={
            "required_documents_present": True, "documents_readable": True,
            "identity_details_consistent": True, "qualifications_consistent": True,
            "teaching_details_consistent": True, "no_obvious_alteration_detected": True,
        })
        self.assertEqual(resp.status_code, 400)

    def test_verify_missing_cv_rejected(self):
        teacher, profile = _make_submitted_teacher(db.session, "ver6")
        profile.profile_status = "under_review"
        profile.cv_file_id = None
        db.session.commit()
        self._login_admin()
        resp = self.client.post(f"/api/admin/teachers/{teacher.id}/verify", json={
            "required_documents_present": True, "documents_readable": True,
            "identity_details_consistent": True, "qualifications_consistent": True,
            "teaching_details_consistent": True, "no_obvious_alteration_detected": True,
        })
        self.assertEqual(resp.status_code, 400)

    def test_verify_missing_certificate_rejected(self):
        teacher, profile = _make_submitted_teacher(db.session, "ver7")
        profile.profile_status = "under_review"
        profile.certificate_file_id = None
        db.session.commit()
        self._login_admin()
        resp = self.client.post(f"/api/admin/teachers/{teacher.id}/verify", json={
            "required_documents_present": True, "documents_readable": True,
            "identity_details_consistent": True, "qualifications_consistent": True,
            "teaching_details_consistent": True, "no_obvious_alteration_detected": True,
        })
        self.assertEqual(resp.status_code, 400)

    def test_verify_rejects_document_from_other_user(self):
        teacher, profile = _make_submitted_teacher(db.session, "ver8")
        profile.profile_status = "under_review"
        other_cv = UploadedFile(
            owner_id=self.admin_user.id, original_filename="other.pdf",
            stored_filename="other_stored.pdf", storage_path="/tmp/other.pdf",
            mime_type="application/pdf", size_bytes=100, category="cv",
        )
        db.session.add(other_cv)
        db.session.flush()
        profile.cv_file_id = other_cv.id
        db.session.commit()
        self._login_admin()
        resp = self.client.post(f"/api/admin/teachers/{teacher.id}/verify", json={
            "required_documents_present": True, "documents_readable": True,
            "identity_details_consistent": True, "qualifications_consistent": True,
            "teaching_details_consistent": True, "no_obvious_alteration_detected": True,
        })
        self.assertEqual(resp.status_code, 400)
        self.assertIn("invalid", resp.get_json().get("error", "").lower())

    def test_verify_creates_audit_events(self):
        teacher, profile = _make_submitted_teacher(db.session, "ver9")
        profile.profile_status = "under_review"
        db.session.commit()
        self._login_admin()
        self.client.post(f"/api/admin/teachers/{teacher.id}/verify", json={
            "required_documents_present": True, "documents_readable": True,
            "identity_details_consistent": True, "qualifications_consistent": True,
            "teaching_details_consistent": True, "no_obvious_alteration_detected": True,
        })
        verify_events = AuditLog.query.filter_by(action="teacher_profile_visually_verified").all()
        self.assertEqual(len(verify_events), 1)
        id_events = AuditLog.query.filter_by(action="teacher_id_issued").all()
        self.assertEqual(len(id_events), 1)

    def test_verify_application_id_unchanged(self):
        teacher, profile = _make_submitted_teacher(db.session, "ver10")
        profile.profile_status = "under_review"
        app_id = teacher.application_id
        db.session.commit()
        self._login_admin()
        self.client.post(f"/api/admin/teachers/{teacher.id}/verify", json={
            "required_documents_present": True, "documents_readable": True,
            "identity_details_consistent": True, "qualifications_consistent": True,
            "teaching_details_consistent": True, "no_obvious_alteration_detected": True,
        })
        db.session.refresh(teacher)
        self.assertEqual(teacher.application_id, app_id)

    # -- idempotency --

    def test_verify_idempotent_returns_same_teacher_id(self):
        teacher, profile = _make_submitted_teacher(db.session, "idem1")
        profile.profile_status = "under_review"
        db.session.commit()
        self._login_admin()
        req = {
            "required_documents_present": True, "documents_readable": True,
            "identity_details_consistent": True, "qualifications_consistent": True,
            "teaching_details_consistent": True, "no_obvious_alteration_detected": True,
        }
        resp1 = self.client.post(f"/api/admin/teachers/{teacher.id}/verify", json=req)
        self.assertEqual(resp1.status_code, 200)
        tid1 = resp1.get_json()["teacher_id"]
        resp2 = self.client.post(f"/api/admin/teachers/{teacher.id}/verify", json=req)
        self.assertEqual(resp2.status_code, 200)
        tid2 = resp2.get_json()["teacher_id"]
        self.assertEqual(tid1, tid2)

    def test_verify_idempotent_no_duplicate_audit_events(self):
        teacher, profile = _make_submitted_teacher(db.session, "idem2")
        profile.profile_status = "under_review"
        db.session.commit()
        self._login_admin()
        req = {
            "required_documents_present": True, "documents_readable": True,
            "identity_details_consistent": True, "qualifications_consistent": True,
            "teaching_details_consistent": True, "no_obvious_alteration_detected": True,
        }
        self.client.post(f"/api/admin/teachers/{teacher.id}/verify", json=req)
        self.client.post(f"/api/admin/teachers/{teacher.id}/verify", json=req)
        verify_events = AuditLog.query.filter_by(action="teacher_profile_visually_verified").all()
        self.assertEqual(len(verify_events), 1)
        id_events = AuditLog.query.filter_by(action="teacher_id_issued").all()
        self.assertEqual(len(id_events), 1)

    # -- profile locks for new states --

    def test_under_review_profile_edit_blocked(self):
        teacher, profile = _make_submitted_teacher(db.session, "lock1")
        profile.profile_status = "under_review"
        db.session.commit()
        self._login_as("teacher-lock1@example.com", "TeacherPassword1!")
        resp = self.client.put("/api/me/profile", json={"location": "Kumasi"})
        self.assertEqual(resp.status_code, 423)

    def test_under_review_upload_blocked(self):
        teacher, profile = _make_submitted_teacher(db.session, "lock2")
        profile.profile_status = "under_review"
        db.session.commit()
        self._login_as("teacher-lock2@example.com", "TeacherPassword1!")
        resp = self.client.post("/api/me/uploads", data={
            "file": (io.BytesIO(b"content"), "cv_new.pdf"),
            "kind": "cv",
        }, content_type="multipart/form-data")
        self.assertEqual(resp.status_code, 423)

    def test_under_review_name_change_blocked(self):
        teacher, profile = _make_submitted_teacher(db.session, "lock3")
        profile.profile_status = "under_review"
        db.session.commit()
        self._login_as("teacher-lock3@example.com", "TeacherPassword1!")
        resp = self.client.put("/api/me/account", json={"first_name": "New", "last_name": "Name"})
        self.assertEqual(resp.status_code, 423)

    def test_verified_edit_requires_reason_and_reopens_review(self):
        teacher, profile = _make_submitted_teacher(db.session, "lock4")
        profile.profile_status = "verified"
        db.session.commit()
        self._login_as("teacher-lock4@example.com", "TeacherPassword1!")
        missing_reason = self.client.put("/api/me/profile", json={"bio": "New bio"})
        self.assertEqual(missing_reason.status_code, 400)
        resp = self.client.put("/api/me/profile", json={"bio": "New bio", "change_reason": "Updated professional experience"})
        self.assertEqual(resp.status_code, 200)
        db.session.refresh(profile)
        self.assertEqual(profile.profile_status, "submitted")
        event = AuditLog.query.filter_by(action="teacher_profile_reverification_requested", actor_id=teacher.id).one()
        self.assertEqual(event.details["reason"], "Updated professional experience")

    def test_verified_upload_requires_reason_and_reopens_review(self):
        teacher, profile = _make_submitted_teacher(db.session, "lock5")
        profile.profile_status = "verified"
        db.session.commit()
        self._login_as("teacher-lock5@example.com", "TeacherPassword1!")
        resp = self.client.post("/api/me/uploads", data={
            "file": (io.BytesIO(b"%PDF-1.4\n%%EOF"), "cv_new.pdf"),
            "kind": "cv",
            "change_reason": "Replacing an outdated curriculum vitae",
        }, content_type="multipart/form-data")
        self.assertEqual(resp.status_code, 201)
        db.session.refresh(profile)
        self.assertEqual(profile.profile_status, "submitted")
        event = AuditLog.query.filter_by(action="teacher_profile_reverification_requested", actor_id=teacher.id).one()
        self.assertEqual(event.details["reason"], "Replacing an outdated curriculum vitae")

    def test_rejected_edit_blocked(self):
        teacher, profile = _make_submitted_teacher(db.session, "lock6")
        profile.profile_status = "rejected"
        db.session.commit()
        self._login_as("teacher-lock6@example.com", "TeacherPassword1!")
        resp = self.client.put("/api/me/profile", json={"bio": "New bio"})
        self.assertEqual(resp.status_code, 423)

    def test_rejected_name_change_blocked(self):
        teacher, profile = _make_submitted_teacher(db.session, "lock7")
        profile.profile_status = "rejected"
        db.session.commit()
        self._login_as("teacher-lock7@example.com", "TeacherPassword1!")
        resp = self.client.put("/api/me/account", json={"first_name": "New", "last_name": "Name"})
        self.assertEqual(resp.status_code, 423)

    def test_rejected_upload_blocked(self):
        teacher, profile = _make_submitted_teacher(db.session, "lock8")
        profile.profile_status = "rejected"
        db.session.commit()
        self._login_as("teacher-lock8@example.com", "TeacherPassword1!")
        resp = self.client.post("/api/me/uploads", data={
            "file": (io.BytesIO(b"content"), "cv_new.pdf"),
            "kind": "cv",
        }, content_type="multipart/form-data")
        self.assertEqual(resp.status_code, 423)

    def test_locked_account_read_access_allowed(self):
        teacher, profile = _make_submitted_teacher(db.session, "lock9")
        profile.profile_status = "verified"
        db.session.commit()
        self._login_as("teacher-lock9@example.com", "TeacherPassword1!")
        resp = self.client.get("/api/me/profile")
        self.assertEqual(resp.status_code, 200)

    def test_invalid_status_filter_rejected(self):
        self._login_admin()
        resp = self.client.get("/api/admin/teachers/review?status=invalid")
        self.assertEqual(resp.status_code, 400)

    # -- inconsistent pre-existing teacher_id --

    def _verify_payload(self):
        return {
            "required_documents_present": True, "documents_readable": True,
            "identity_details_consistent": True, "qualifications_consistent": True,
            "teaching_details_consistent": True, "no_obvious_alteration_detected": True,
        }

    def test_reverification_preserves_existing_teacher_id(self):
        """under_review + teacher_id already set is inconsistent → 409."""
        teacher, profile = _make_submitted_teacher(db.session, "undrvid")
        profile.profile_status = "under_review"
        teacher.teacher_id = "RMX-TCH-000999"
        teacher.teacher_id_issued_at = datetime.now(timezone.utc)
        db.session.commit()
        original_issued_at = teacher.teacher_id_issued_at
        self._login_admin()
        resp = self.client.post(
            f"/api/admin/teachers/{teacher.id}/verify", json=self._verify_payload()
        )
        self.assertEqual(resp.status_code, 200)
        db.session.refresh(teacher)
        db.session.refresh(profile)
        self.assertEqual(profile.profile_status, "verified")
        self.assertEqual(teacher.teacher_id, "RMX-TCH-000999")
        self.assertEqual(teacher.teacher_id_issued_at, original_issued_at)
        verify_events = AuditLog.query.filter_by(action="teacher_profile_visually_verified").all()
        self.assertEqual(len(verify_events), 1)
        issue_events = AuditLog.query.filter_by(action="teacher_id_issued").all()
        self.assertEqual(len(issue_events), 0)

    def test_verify_verified_preserves_teacher_id_issued_at(self):
        """Verified + teacher_id returns idempotently preserving issued_at."""
        teacher, profile = _make_submitted_teacher(db.session, "idem3")
        profile.profile_status = "under_review"
        db.session.commit()
        self._login_admin()
        resp1 = self.client.post(
            f"/api/admin/teachers/{teacher.id}/verify", json=self._verify_payload()
        )
        self.assertEqual(resp1.status_code, 200)
        data1 = resp1.get_json()
        db.session.refresh(teacher)
        original_issued_at = teacher.teacher_id_issued_at
        self.assertIsNotNone(original_issued_at)
        resp2 = self.client.post(
            f"/api/admin/teachers/{teacher.id}/verify", json=self._verify_payload()
        )
        self.assertEqual(resp2.status_code, 200)
        db.session.refresh(teacher)
        self.assertEqual(teacher.teacher_id, data1["teacher_id"])
        self.assertEqual(teacher.teacher_id_issued_at, original_issued_at)
        verify_events = AuditLog.query.filter_by(action="teacher_profile_visually_verified").all()
        self.assertEqual(len(verify_events), 1)


class TeacherReviewEmailTests(unittest.TestCase):
    """Email delivery tests for teacher-review milestones."""

    def setUp(self):
        self.app = create_app(TeacherReviewTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        db.session.execute(db.text("PRAGMA foreign_keys = ON"))
        admin_role = Role(name="admin", description="Admin")
        teacher_role = Role(name="user", description="Teacher")
        staff_role = Role(name="staff", description="Staff")
        db.session.add_all([admin_role, teacher_role, staff_role])
        db.session.commit()
        self.admin_user = _make_admin(db.session)
        self.client = self.app.test_client()

    def tearDown(self):
        db.session.remove()
        self.context.pop()

    # ── helpers ──

    def _login_admin(self):
        resp = self.client.post("/api/auth/login", json={
            "email": self.admin_user.email, "password": "AdminPassword123!",
        })
        self.assertEqual(resp.status_code, 200)

    def _login_as(self, email, password):
        resp = self.client.post("/api/auth/login", json={"email": email, "password": password})
        self.assertEqual(resp.status_code, 200)

    def _make_rejected_teacher(self, session):
        teacher, profile = _make_submitted_teacher(session, "email-reject-1")
        profile.profile_status = "rejected"
        profile.review_notes = "Documents do not meet our requirements."
        session.commit()
        return teacher, profile

    def _make_under_review_teacher(self, session):
        teacher, profile = _make_submitted_teacher(session, "email-ur-1")
        profile.profile_status = "under_review"
        session.commit()
        return teacher, profile

    @staticmethod
    def _attach_cv_and_cert(session, teacher):
        cv = UploadedFile(
            owner_id=teacher.id, original_filename="cv.pdf", stored_filename="cv_stored.pdf",
            storage_path="/tmp/cv.pdf", mime_type="application/pdf", size_bytes=100, category="cv",
        )
        cert = UploadedFile(
            owner_id=teacher.id, original_filename="cert.pdf", stored_filename="cert_stored.pdf",
            storage_path="/tmp/cert.pdf", mime_type="application/pdf", size_bytes=100, category="certificate",
        )
        session.add_all([cv, cert])
        session.flush()
        teacher.profile.cv_file_id = cv.id
        teacher.profile.certificate_file_id = cert.id
        session.commit()

    # ── Account creation ──

    @patch("backend.api.auth._send_teacher_account_created_email")
    @patch("backend.api.auth._send_verification_otp")
    def test_signup_sends_account_created_email(self, _otp, mock_email):
        _otp.return_value = CommunicationResult(
            channel="email",
            purpose="security",
            provider="mock",
            mode="mock",
            status="mocked",
        )
        resp = self.client.post("/api/auth/signup", json={
            "email": "newteacher@example.com",
            "password": "StrongPass1!",
            "first_name": "New",
            "last_name": "Teacher",
            "phone": "0241234567",
            "accepted_terms": True,
        })
        self.assertEqual(resp.status_code, 201)
        data = resp.get_json()
        mock_email.assert_called_once()
        user_arg = mock_email.call_args[0][0]
        self.assertEqual(user_arg.email, "newteacher@example.com")
        self.assertIsNotNone(user_arg.application_id)

    @patch("backend.api.auth._send_teacher_account_created_email")
    def test_non_teacher_signup_does_not_send_teacher_email(self, mock_email):
        payload = {
            "email": "bookshopuser@example.com",
            "password": "StrongPass1!",
            "first_name": "Bookshop",
            "last_name": "User",
            "phone": "0241234567",
            "accepted_terms": True,
            "surface": "bookshop",
        }
        resp = self.client.post("/api/auth/signup", json=payload)
        self.assertEqual(resp.status_code, 201)
        mock_email.assert_not_called()

    @patch("backend.api.auth._send_teacher_account_created_email")
    @patch("backend.api.auth._send_verification_otp")
    def test_failed_signup_sends_no_email(self, _otp, mock_email):
        resp = self.client.post("/api/auth/signup", json={
            "email": "incomplete@example.com",
            "password": "short",
        })
        self.assertEqual(resp.status_code, 400)
        mock_email.assert_not_called()

    @patch("backend.api.auth._send_teacher_account_created_email")
    @patch("backend.api.auth._send_verification_otp")
    def test_duplicate_email_signup_does_not_send(self, _otp, mock_email):
        _otp.return_value = CommunicationResult(
            channel="email",
            purpose="security",
            provider="mock",
            mode="mock",
            status="mocked",
        )
        self.client.post("/api/auth/signup", json={
            "email": "dup@example.com", "password": "StrongPass1!",
            "first_name": "Dup", "accepted_terms": True, "phone": "0241234567",
        })
        mock_email.reset_mock()
        resp2 = self.client.post("/api/auth/signup", json={
            "email": "dup@example.com", "password": "StrongPass1!",
            "first_name": "Dup", "accepted_terms": True, "phone": "0241234567",
        })
        self.assertEqual(resp2.status_code, 409)
        mock_email.assert_not_called()

    # ── Profile submission ──

    @patch("backend.api.profile.send_email")
    def test_submission_sends_one_email(self, mock_send):
        teacher, profile = _make_submitted_teacher(db.session, "sub-email-1")
        profile.profile_status = "complete"
        db.session.commit()
        self._login_as(teacher.email, "TeacherPassword1!")
        resp = self.client.post(f"/api/me/profile/submit")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(mock_send.call_count, 1)
        msg = mock_send.call_args[0][0]
        self.assertIn("Your Teacher Application Has Been Submitted", msg.subject)
        self.assertIn(str(teacher.application_id), msg.html)

    @patch("backend.api.profile.send_email")
    def test_incomplete_submission_sends_no_email(self, mock_send):
        teacher, profile = _make_submitted_teacher(db.session, "sub-email-2")
        profile.profile_status = "incomplete"
        profile.cv_file_id = None
        db.session.commit()
        self._login_as(teacher.email, "TeacherPassword1!")
        resp = self.client.post(f"/api/me/profile/submit")
        self.assertEqual(resp.status_code, 400)
        mock_send.assert_not_called()

    @patch("backend.api.profile.send_email")
    def test_repeated_submission_does_not_duplicate_email(self, mock_send):
        teacher, profile = _make_submitted_teacher(db.session, "sub-email-3")
        profile.profile_status = "submitted"
        db.session.commit()
        self._login_as(teacher.email, "TeacherPassword1!")
        resp = self.client.post(f"/api/me/profile/submit")
        self.assertEqual(resp.status_code, 200)
        mock_send.assert_not_called()

    # ── Revision required ──

    @patch("backend.api.admin.send_email")
    def test_revision_sends_one_email(self, mock_send):
        teacher, _ = self._make_under_review_teacher(db.session)
        self._login_admin()
        resp = self.client.post(
            f"/api/admin/teachers/{teacher.id}/request-revision",
            json={"note": "Please upload a clearer CV."},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(mock_send.call_count, 1)
        msg = mock_send.call_args[0][0]
        self.assertIn("Update Your Teacher Application", msg.subject)
        self.assertIn(str(teacher.application_id), msg.html)
        self.assertIn("clearer CV", msg.html)

    @patch("backend.api.admin.send_email")
    def test_revision_email_contains_application_id_and_note(self, mock_send):
        teacher, _ = self._make_under_review_teacher(db.session)
        self._login_admin()
        self.client.post(
            f"/api/admin/teachers/{teacher.id}/request-revision",
            json={"note": "Certificate is blurry.\nPlease re-upload."},
        )
        msg = mock_send.call_args[0][0]
        self.assertIn(str(teacher.application_id), msg.html)
        self.assertIn("Certificate is blurry", msg.html)

    @patch("backend.api.admin.send_email")
    def test_revision_duplicate_does_not_send_second_email(self, mock_send):
        teacher, _ = self._make_under_review_teacher(db.session)
        self._login_admin()
        self.client.post(
            f"/api/admin/teachers/{teacher.id}/request-revision",
            json={"note": "Fix your CV."},
        )
        mock_send.reset_mock()
        resp2 = self.client.post(
            f"/api/admin/teachers/{teacher.id}/request-revision",
            json={"note": "Fix your CV."},
        )
        self.assertEqual(resp2.status_code, 200)
        mock_send.assert_not_called()

    # ── Rejection ──

    @patch("backend.api.admin.send_email")
    def test_rejection_sends_one_email(self, mock_send):
        teacher, _ = self._make_under_review_teacher(db.session)
        self._login_admin()
        resp = self.client.post(
            f"/api/admin/teachers/{teacher.id}/reject",
            json={"reason": "Documents do not meet our standards."},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(mock_send.call_count, 1)
        msg = mock_send.call_args[0][0]
        self.assertIn("Update on Your RealMindX Teacher Application", msg.subject)
        self.assertIn(str(teacher.application_id), msg.html)
        self.assertIn("Documents do not meet our standards", msg.html)
        self.assertIn("reconsideration", msg.html)

    @patch("backend.api.admin.send_email")
    def test_rejection_duplicate_does_not_send_second_email(self, mock_send):
        teacher, profile = self._make_under_review_teacher(db.session)
        profile.profile_status = "rejected"
        db.session.commit()
        self._login_admin()
        self.client.post(
            f"/api/admin/teachers/{teacher.id}/reject",
            json={"reason": "Already rejected."},
        )
        mock_send.assert_not_called()

    # ── Reopening ──

    @patch("backend.api.admin.send_email")
    def test_reopen_sends_one_email(self, mock_send):
        teacher, _ = self._make_rejected_teacher(db.session)
        self._login_admin()
        resp = self.client.post(
            f"/api/admin/teachers/{teacher.id}/reopen-review",
            json={"note": "Teacher provided new documentation."},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(mock_send.call_count, 1)
        msg = mock_send.call_args[0][0]
        self.assertIn("Has Been Reopened", msg.subject)
        self.assertIn(str(teacher.application_id), msg.html)
        self.assertNotIn("approved", msg.subject.lower())

    @patch("backend.api.admin.send_email")
    def test_reopen_duplicate_does_not_send_second_email(self, mock_send):
        teacher, profile = self._make_rejected_teacher(db.session)
        profile.profile_status = "under_review"
        db.session.commit()
        self._login_admin()
        self.client.post(
            f"/api/admin/teachers/{teacher.id}/reopen-review",
            json={"note": "Already reopened."},
        )
        mock_send.assert_not_called()

    # ── Verification ──

    def _verify_payload(self):
        return {
            "required_documents_present": True,
            "documents_readable": True,
            "identity_details_consistent": True,
            "qualifications_consistent": True,
            "teaching_details_consistent": True,
            "no_obvious_alteration_detected": True,
        }

    @patch("backend.api.admin.send_email")
    def test_verification_sends_one_email(self, mock_send):
        teacher, profile = _make_submitted_teacher(db.session, "ver-email-1")
        profile.profile_status = "under_review"
        self._attach_cv_and_cert(db.session, teacher)
        db.session.commit()
        self._login_admin()
        resp = self.client.post(
            f"/api/admin/teachers/{teacher.id}/verify",
            json=self._verify_payload(),
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(mock_send.call_count, 1)
        msg = mock_send.call_args[0][0]
        self.assertIn("Has Been Verified", msg.subject)
        self.assertIn(str(teacher.application_id), msg.html)
        db.session.refresh(teacher)
        self.assertIn(str(teacher.teacher_id), msg.html)

    @patch("backend.api.admin.send_email")
    def test_verification_duplicate_does_not_send_second_email(self, mock_send):
        teacher, profile = _make_submitted_teacher(db.session, "ver-email-2")
        profile.profile_status = "verified"
        teacher.teacher_id = "RMX-TCH-999999"
        teacher.teacher_id_issued_at = datetime.now(timezone.utc)
        self._attach_cv_and_cert(db.session, teacher)
        db.session.commit()
        self._login_admin()
        self.client.post(
            f"/api/admin/teachers/{teacher.id}/verify",
            json=self._verify_payload(),
        )
        mock_send.assert_not_called()

    @patch("backend.api.admin.send_email")
    def test_failed_verification_sends_no_email(self, mock_send):
        teacher, profile = _make_submitted_teacher(db.session, "ver-email-3")
        profile.profile_status = "under_review"
        profile.cv_file_id = None
        db.session.commit()
        self._login_admin()
        resp = self.client.post(
            f"/api/admin/teachers/{teacher.id}/verify",
            json=self._verify_payload(),
        )
        self.assertEqual(resp.status_code, 400)
        mock_send.assert_not_called()

    # ── General safety ──

    @patch("backend.api.admin.send_email")
    def test_email_failure_does_not_rollback_status_change(self, mock_send):
        mock_send.side_effect = RuntimeError("Email provider offline")
        teacher, _ = self._make_under_review_teacher(db.session)
        self._login_admin()
        resp = self.client.post(
            f"/api/admin/teachers/{teacher.id}/reject",
            json={"reason": "Test rejection with email failure."},
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data["profile_status"], "rejected")
        db.session.refresh(teacher)
        self.assertEqual(teacher.profile.profile_status, "rejected")

    @patch("backend.api.admin.send_email")
    def test_review_notes_escaped_safely(self, mock_send):
        teacher, _ = self._make_under_review_teacher(db.session)
        self._login_admin()
        self.client.post(
            f"/api/admin/teachers/{teacher.id}/request-revision",
            json={"note": "<script>alert('xss')</script>"},
        )
        msg = mock_send.call_args[0][0]
        self.assertIn("&lt;script&gt;", msg.html)
        self.assertNotIn("<script>", msg.html)

    @patch("backend.api.admin.send_email")
    def test_email_links_use_configured_base_url(self, mock_send):
        teacher, _ = self._make_under_review_teacher(db.session)
        self._login_admin()
        self.client.post(
            f"/api/admin/teachers/{teacher.id}/request-revision",
            json={"note": "Please update."},
        )
        msg = mock_send.call_args[0][0]
        self.assertIn("http://localhost", msg.html)


if __name__ == "__main__":
    unittest.main()
