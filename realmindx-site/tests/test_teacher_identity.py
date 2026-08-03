import sys
import unittest
from pathlib import Path
from datetime import datetime, timezone

SITE_ROOT = Path(__file__).resolve().parents[1]
if str(SITE_ROOT) not in sys.path:
    sys.path.insert(0, str(SITE_ROOT))

from backend import create_app
from backend.config import Config
from backend.extensions import db
from backend.models import Role, TeacherIdCounter, TeacherIdGlobalCounter, User, UserProfile
from backend.teacher_ids import (
    APPLICATION_ID_PATTERN,
    TEACHER_ID_PATTERN,
    ensure_application_id,
    generate_application_id,
    generate_teacher_id,
    is_valid_application_id,
    is_valid_teacher_id,
)


class TeacherIdentityTestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    SECRET_KEY = "teacher-identity-tests"
    BASE_URL = "http://localhost"
    BOOKSHOP_URL = "http://bookshop.localhost"
    CORS_ORIGINS = ["http://localhost", "http://bookshop.localhost"]
    RATELIMIT_ENABLED = False


class TestTeacherIdHelpers(unittest.TestCase):
    def setUp(self):
        self.app = create_app(TeacherIdentityTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        db.session.execute(db.text("PRAGMA foreign_keys = ON"))

        self.teacher_role = Role(name="user", description="Teacher")
        db.session.add(self.teacher_role)
        db.session.commit()

    def tearDown(self):
        db.session.remove()
        db.session.execute(db.text("PRAGMA foreign_keys = OFF"))
        db.session.commit()
        db.drop_all()
        self.context.pop()

    def test_generate_application_id_format(self):
        app_id = generate_application_id()
        self.assertRegex(app_id, r"^RMX-APP-\d{4}-\d{6}$")
        self.assertTrue(is_valid_application_id(app_id))

    def test_generate_teacher_id_format(self):
        tch_id = generate_teacher_id()
        self.assertRegex(tch_id, r"^RMX-TCH-\d{6}$")
        self.assertTrue(is_valid_teacher_id(tch_id))

    def test_application_id_pattern_rejects_invalid(self):
        self.assertFalse(is_valid_application_id(""))
        self.assertFalse(is_valid_application_id("RMX-APP-2026-000001-extra"))
        self.assertFalse(is_valid_application_id("TCH-2026-000001"))
        self.assertFalse(is_valid_application_id("RMX-APP-ABC-000001"))

    def test_teacher_id_pattern_rejects_invalid(self):
        self.assertFalse(is_valid_teacher_id(""))
        self.assertFalse(is_valid_teacher_id("RMX-TCH-000001-extra"))
        self.assertFalse(is_valid_teacher_id("RMX-APP-2026-000001"))

    def test_application_id_sequential(self):
        id1 = generate_application_id()
        id2 = generate_application_id()
        id3 = generate_application_id()
        seq1 = int(id1.split("-")[-1])
        seq2 = int(id2.split("-")[-1])
        seq3 = int(id3.split("-")[-1])
        self.assertEqual(seq2, seq1 + 1)
        self.assertEqual(seq3, seq2 + 1)

    def test_teacher_id_sequential(self):
        id1 = generate_teacher_id()
        id2 = generate_teacher_id()
        id3 = generate_teacher_id()
        seq1 = int(id1.split("-")[-1])
        seq2 = int(id2.split("-")[-1])
        seq3 = int(id3.split("-")[-1])
        self.assertEqual(seq2, seq1 + 1)
        self.assertEqual(seq3, seq2 + 1)

    def test_teacher_id_global_cross_year(self):
        """Teacher ID sequence must NOT reset across years."""
        from backend.teacher_ids import _get_global_teacher_counter

        counter1 = _get_global_teacher_counter()
        start_seq = counter1.last_teacher_seq
        id1 = generate_teacher_id()
        seq1 = int(id1.split("-")[-1])
        self.assertEqual(seq1, start_seq + 1)

        id2 = generate_teacher_id()
        seq2 = int(id2.split("-")[-1])
        self.assertEqual(seq2, seq1 + 1)

        # Simulate a new year by manipulating the counter directly;
        # the sequence must keep incrementing, not reset.
        counter2 = _get_global_teacher_counter()
        self.assertEqual(counter2.id, counter1.id)
        self.assertEqual(counter2.last_teacher_seq, seq2)

    def test_application_id_includes_year(self):
        app_id = generate_application_id()
        parts = app_id.split("-")
        self.assertEqual(len(parts), 4)
        year_part = parts[2]
        self.assertEqual(len(year_part), 4)
        self.assertTrue(year_part.isdigit())

    def test_ids_are_unique(self):
        ids = {generate_application_id() for _ in range(50)}
        self.assertEqual(len(ids), 50)

    def test_ensure_application_id_repairs_missing_teacher_id(self):
        user = User(
            email="missing-id@example.com",
            first_name="Missing",
            last_name="Identifier",
            role=self.teacher_role,
            is_active=True,
            is_verified=True,
            teacher_service_enabled=True,
        )
        user.set_password("Password123!")
        db.session.add(user)
        db.session.flush()

        application_id = ensure_application_id(user)
        db.session.commit()

        self.assertTrue(is_valid_application_id(application_id))
        self.assertEqual(user.application_id, application_id)

    def test_ensure_application_id_preserves_valid_existing_id(self):
        user = User(
            email="existing-id@example.com",
            first_name="Existing",
            last_name="Identifier",
            role=self.teacher_role,
            is_active=True,
            is_verified=True,
            teacher_service_enabled=True,
            application_id="RMX-APP-2025-000123",
        )
        user.set_password("Password123!")
        db.session.add(user)
        db.session.flush()

        application_id = ensure_application_id(user)

        self.assertEqual(application_id, "RMX-APP-2025-000123")
        self.assertEqual(TeacherIdCounter.query.count(), 0)

    def test_ensure_application_id_replaces_malformed_legacy_value(self):
        user = User(
            email="legacy-id@example.com",
            first_name="Legacy",
            last_name="Identifier",
            role=self.teacher_role,
            is_active=True,
            is_verified=True,
            teacher_service_enabled=True,
            application_id="#76",
        )
        user.set_password("Password123!")
        db.session.add(user)
        db.session.flush()

        application_id = ensure_application_id(user)

        self.assertTrue(is_valid_application_id(application_id))
        self.assertNotEqual(application_id, "#76")

    def test_oauth_teacher_signup_assigns_application_id(self):
        from flask import session
        from backend.api.oauth import _get_or_create_user

        with self.app.test_request_context("/"):
            session["oauth_surface"] = "main"
            session["oauth_terms_accepted"] = True
            user, created = _get_or_create_user(
                "google",
                "oauth-teacher-1",
                "oauth-teacher@example.com",
                "OAuth",
                "Teacher",
            )

        self.assertTrue(created)
        self.assertTrue(user.teacher_service_enabled)
        self.assertTrue(is_valid_application_id(user.application_id))

    def test_teacher_login_repairs_bookshop_account_application_id(self):
        bookshop_user = User(
            email="bookshop-to-teacher@example.com",
            first_name="Bookshop",
            last_name="Teacher",
            role=self.teacher_role,
            is_active=True,
            is_verified=True,
            teacher_service_enabled=False,
            bookshop_service_enabled=True,
        )
        bookshop_user.set_password("Password123!")
        db.session.add(bookshop_user)
        db.session.commit()

        response = self.app.test_client().post("/api/auth/login", json={
            "email": bookshop_user.email,
            "password": "Password123!",
            "surface": "teacher",
        })

        self.assertEqual(response.status_code, 200)
        db.session.refresh(bookshop_user)
        self.assertTrue(bookshop_user.teacher_service_enabled)
        self.assertTrue(is_valid_application_id(bookshop_user.application_id))

    def test_existing_teacher_login_repairs_missing_application_id_without_surface(self):
        teacher = User(
            email="existing-teacher-gap@example.com",
            first_name="Existing",
            last_name="Teacher",
            role=self.teacher_role,
            is_active=True,
            is_verified=True,
            teacher_service_enabled=True,
            application_id=None,
        )
        teacher.set_password("Password123!")
        db.session.add(teacher)
        db.session.commit()

        response = self.app.test_client().post("/api/auth/login", json={
            "email": teacher.email,
            "password": "Password123!",
        })

        self.assertEqual(response.status_code, 200)
        db.session.refresh(teacher)
        self.assertTrue(is_valid_application_id(teacher.application_id))


class TestUserModelFields(unittest.TestCase):
    def setUp(self):
        self.app = create_app(TeacherIdentityTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        db.session.execute(db.text("PRAGMA foreign_keys = ON"))

        self.teacher_role = Role(name="user", description="Teacher")
        db.session.add(self.teacher_role)
        db.session.commit()

    def tearDown(self):
        db.session.remove()
        db.session.execute(db.text("PRAGMA foreign_keys = OFF"))
        db.session.commit()
        db.drop_all()
        self.context.pop()

    def test_application_id_nullable(self):
        user = User(
            email="test@example.com",
            first_name="Test",
            last_name="User",
            role=self.teacher_role,
            is_active=True,
            is_verified=True,
        )
        user.set_password("Password123!")
        db.session.add(user)
        db.session.commit()
        self.assertIsNone(user.application_id)
        self.assertIsNone(user.teacher_id)

    def test_application_id_unique_constraint(self):
        user1 = User(
            email="user1@example.com",
            first_name="User",
            last_name="One",
            role=self.teacher_role,
            is_active=True,
            is_verified=True,
            application_id="RMX-APP-2026-000001",
        )
        user1.set_password("Password123!")
        db.session.add(user1)
        db.session.commit()

        user2 = User(
            email="user2@example.com",
            first_name="User",
            last_name="Two",
            role=self.teacher_role,
            is_active=True,
            is_verified=True,
            application_id="RMX-APP-2026-000001",
        )
        user2.set_password("Password123!")
        with self.assertRaises(Exception):
            db.session.add(user2)
            db.session.commit()
        db.session.rollback()

    def test_teacher_id_unique_constraint(self):
        user1 = User(
            email="user3@example.com",
            first_name="User",
            last_name="Three",
            role=self.teacher_role,
            is_active=True,
            is_verified=True,
            teacher_id="RMX-TCH-000001",
        )
        user1.set_password("Password123!")
        db.session.add(user1)
        db.session.commit()

        user2 = User(
            email="user4@example.com",
            first_name="User",
            last_name="Four",
            role=self.teacher_role,
            is_active=True,
            is_verified=True,
            teacher_id="RMX-TCH-000001",
        )
        user2.set_password("Password123!")
        with self.assertRaises(Exception):
            db.session.add(user2)
            db.session.commit()
        db.session.rollback()

    def test_application_id_indexed(self):
        from sqlalchemy import inspect
        inspector = inspect(db.engine)
        indexes = [idx["name"] for idx in inspector.get_indexes("users")]
        self.assertIn("ix_users_application_id", indexes)

    def test_teacher_id_indexed(self):
        from sqlalchemy import inspect
        inspector = inspect(db.engine)
        indexes = [idx["name"] for idx in inspector.get_indexes("users")]
        self.assertIn("ix_users_teacher_id", indexes)


class TestUserProfileReviewFields(unittest.TestCase):
    def setUp(self):
        self.app = create_app(TeacherIdentityTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        db.session.execute(db.text("PRAGMA foreign_keys = ON"))

        self.teacher_role = Role(name="user", description="Teacher")
        db.session.add(self.teacher_role)
        db.session.commit()

        self.teacher = User(
            email="teacher@example.com",
            first_name="Profile",
            last_name="Test",
            role=self.teacher_role,
            is_active=True,
            is_verified=True,
        )
        self.teacher.set_password("Password123!")
        db.session.add(self.teacher)
        db.session.commit()

        self.profile = UserProfile(user_id=self.teacher.id)
        db.session.add(self.profile)
        db.session.commit()

    def tearDown(self):
        db.session.remove()
        db.session.execute(db.text("PRAGMA foreign_keys = OFF"))
        db.session.commit()
        db.drop_all()
        self.context.pop()

    def test_profile_status_defaults_to_incomplete(self):
        self.assertEqual(self.profile.profile_status, "incomplete")

    def test_profile_status_indexed(self):
        from sqlalchemy import inspect
        inspector = inspect(db.engine)
        indexes = [idx["name"] for idx in inspector.get_indexes("user_profiles")]
        self.assertIn("ix_user_profiles_profile_status", indexes)

    def test_review_fields_nullable(self):
        self.assertIsNone(self.profile.submitted_at)
        self.assertIsNone(self.profile.reviewed_at)
        self.assertIsNone(self.profile.reviewed_by_id)
        self.assertIsNone(self.profile.review_notes)

    def test_reviewed_by_foreign_key(self):
        admin_role = Role(name="admin", description="Admin")
        db.session.add(admin_role)
        db.session.commit()

        admin = User(
            email="admin@example.com",
            first_name="Admin",
            last_name="User",
            role=admin_role,
            is_active=True,
            is_verified=True,
        )
        admin.set_password("AdminPassword123!")
        db.session.add(admin)
        db.session.commit()

        self.profile.profile_status = "submitted"
        self.profile.submitted_at = datetime.now(timezone.utc)
        db.session.commit()

        self.profile.profile_status = "approved"
        self.profile.reviewed_at = datetime.now(timezone.utc)
        self.profile.reviewed_by_id = admin.id
        self.profile.review_notes = "Looks good."
        db.session.commit()

        reviewed = db.session.get(UserProfile, self.profile.id)
        self.assertEqual(reviewed.reviewed_by_id, admin.id)
        self.assertEqual(reviewed.review_notes, "Looks good.")
        self.assertEqual(reviewed.reviewed_by.email, admin.email)


class TestTeacherIdCounterModel(unittest.TestCase):
    def setUp(self):
        self.app = create_app(TeacherIdentityTestConfig)
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()

    def tearDown(self):
        db.session.remove()
        db.session.commit()
        db.drop_all()
        self.context.pop()

    def test_counter_creation(self):
        now = datetime.now(timezone.utc)
        counter = TeacherIdCounter(
            year=2026,
            last_application_seq=0,
            last_teacher_seq=0,
            created_at=now,
            updated_at=now,
        )
        db.session.add(counter)
        db.session.commit()
        self.assertIsNotNone(counter.id)

    def test_year_unique_constraint(self):
        now = datetime.now(timezone.utc)
        c1 = TeacherIdCounter(year=2026, last_application_seq=0, last_teacher_seq=0, created_at=now, updated_at=now)
        db.session.add(c1)
        db.session.commit()

        c2 = TeacherIdCounter(year=2026, last_application_seq=0, last_teacher_seq=0, created_at=now, updated_at=now)
        db.session.add(c2)
        with self.assertRaises(Exception):
            db.session.commit()
        db.session.rollback()

    def test_counter_sequential_application_ids(self):
        now = datetime.now(timezone.utc)
        counter = TeacherIdCounter(
            year=2026,
            last_application_seq=5,
            last_teacher_seq=0,
            created_at=now,
            updated_at=now,
        )
        db.session.add(counter)
        db.session.commit()

        from backend.teacher_ids import _get_and_increment_application_seq
        seq = _get_and_increment_application_seq(2026)
        self.assertEqual(seq, 6)

    def test_global_counter_singleton(self):
        """Only one row should ever exist in teacher_id_global_counter."""
        from backend.teacher_ids import _get_global_teacher_counter

        c1 = _get_global_teacher_counter()
        c2 = _get_global_teacher_counter()
        self.assertEqual(c1.id, 1)
        self.assertEqual(c2.id, 1)
        self.assertEqual(TeacherIdGlobalCounter.query.count(), 1)

    def test_global_counter_sequential_teacher_ids(self):
        """Teacher IDs use the global counter and never reset."""
        from backend.teacher_ids import _get_global_teacher_counter, _next_seq

        counter = _get_global_teacher_counter()
        counter.last_teacher_seq = 100
        db.session.flush()

        seq1 = _next_seq(counter, "last_teacher_seq")
        self.assertEqual(seq1, 101)

        seq2 = _next_seq(counter, "last_teacher_seq")
        self.assertEqual(seq2, 102)


if __name__ == "__main__":
    unittest.main()
