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
from backend.models import Role, TeacherIdCounter, User, UserProfile
from backend.teacher_ids import (
    APPLICATION_ID_PATTERN,
    TEACHER_ID_PATTERN,
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

    def test_application_id_year_rollover(self):
        counter = TeacherIdCounter.query.filter_by(year=2025).first()
        if not counter:
            counter = TeacherIdCounter(
                year=2025,
                last_application_seq=0,
                last_teacher_seq=0,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
            db.session.add(counter)
            db.session.commit()

        app_id = generate_application_id(year_override=2025)
        self.assertIn("2025", app_id)

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

    def test_counter_sequential_teacher_ids(self):
        now = datetime.now(timezone.utc)
        counter = TeacherIdCounter(
            year=2026,
            last_application_seq=0,
            last_teacher_seq=10,
            created_at=now,
            updated_at=now,
        )
        db.session.add(counter)
        db.session.commit()

        from backend.teacher_ids import _get_and_increment_teacher_seq
        seq = _get_and_increment_teacher_seq(2026)
        self.assertEqual(seq, 11)


if __name__ == "__main__":
    unittest.main()
