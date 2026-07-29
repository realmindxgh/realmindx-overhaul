"""Test the Phase 4A.1 migration seed logic.

Exercises ``_seed_global_counter()`` against various pre-migration database
states: empty, existing Teacher IDs, legacy counter rows, or both.
"""

import sys
import tempfile
from pathlib import Path

SITE_ROOT = Path(__file__).resolve().parents[1]
if str(SITE_ROOT) not in sys.path:
    sys.path.insert(0, str(SITE_ROOT))

import pytest
from flask_migrate import upgrade as _migrate_upgrade, downgrade as _migrate_downgrade


def _migrate_up(revision="heads"):
    _migrate_upgrade(revision=revision)


def _migrate_down(revision):
    _migrate_downgrade(revision=revision)


REV_0048 = "0048"
REV_0049 = "61edc4bf3e6f"


def _check_counter(db, expected_seq):
    from backend.models import TeacherIdGlobalCounter
    row = TeacherIdGlobalCounter.query.first()
    assert row is not None, "Counter row must exist"
    assert row.id == 1, f"Expected id=1, got {row.id}"
    assert row.last_teacher_seq == expected_seq, (
        f"Expected last_teacher_seq={expected_seq}, got {row.last_teacher_seq}"
    )


def _raw_insert_user(conn, uid, email, teacher_id):
    """Insert a user using only columns present at migration 0048.

    At the 0048 schema the ``teacher_id_issued_at`` column does not yet
    exist, so we must not include it in the INSERT.

    We supply every NOT NULL column explicitly because SQLite does
    not honour Python-level SQLAlchemy defaults from raw INSERTs.
    """
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    conn.execute(
        __import__("sqlalchemy").text(
            """INSERT INTO users
               (id, email, password_hash, password_login_enabled,
                first_name, phone_verified,
                teacher_service_enabled, bookshop_service_enabled,
                role_id, is_active, is_verified,
                must_change_password, two_factor_enabled,
                failed_login_count,
                teacher_id,
                created_at, updated_at)
               VALUES
               (:uid, :email, '', 1,
                'T', 0,
                1, 0,
                1, 1, 0,
                0, 0,
                0,
                :tid,
                :now, :now)"""
        ),
        {"uid": uid, "email": email, "tid": teacher_id, "now": now},
    )


def _raw_insert_counter(conn, year, seq):
    conn.execute(
        __import__("sqlalchemy").text(
            """INSERT INTO teacher_id_counters
               (id, year, last_application_seq, last_teacher_seq,
                created_at, updated_at)
               VALUES
               (:id, :year, 0, :seq,
                '2026-01-01 00:00:00+00', '2026-01-01 00:00:00+00')"""
        ),
        {"id": year, "year": year, "seq": seq},
    )


@pytest.fixture
def migration_app():
    """Create a Flask app with a temporary SQLite database at migration 0048."""
    from backend import create_app
    from backend.config import Config

    db_path = tempfile.mktemp(suffix=".db")

    class TempConfig(Config):
        TESTING = True
        SQLALCHEMY_DATABASE_URI = f"sqlite:///{db_path}"
        SECRET_KEY = "migration-seed-test"

    app = create_app(TempConfig)
    with app.app_context():
        from backend.extensions import db
        from backend.models import Role

        _migrate_up()
        _migrate_down(REV_0048)

        role = Role.query.filter_by(name="user").first()
        if not role:
            role = Role(name="user", description="Teacher")
            db.session.add(role)
            db.session.commit()

        yield app

        db.session.remove()
        _migrate_up(REV_0048)
        db.engine.dispose()
    Path(db_path).unlink(missing_ok=True)


def test_empty_db(migration_app):
    from backend.extensions import db
    _migrate_up(REV_0049)
    _check_counter(db, 0)
    from backend.teacher_ids import generate_teacher_id
    assert generate_teacher_id() == "RMX-TCH-000001"
    assert generate_teacher_id() == "RMX-TCH-000002"
    db.session.rollback()


def test_existing_teacher_ids(migration_app):
    from backend.extensions import db
    conn = db.session.connection()
    _raw_insert_user(conn, 100, "t0@example.com", "RMX-TCH-000005")
    _raw_insert_user(conn, 101, "t1@example.com", "RMX-TCH-000042")
    _raw_insert_user(conn, 102, "t2@example.com", "RMX-TCH-000184")
    _raw_insert_user(conn, 103, "t3@example.com", "RMX-TCH-000007")
    db.session.commit()
    _migrate_up(REV_0049)
    _check_counter(db, 184)


def test_legacy_counter_only(migration_app):
    from backend.extensions import db
    _raw_insert_counter(db.session.connection(), 2026, 179)
    db.session.commit()
    _migrate_up(REV_0049)
    _check_counter(db, 179)


def test_teacher_id_higher_than_legacy(migration_app):
    from backend.extensions import db
    conn = db.session.connection()
    _raw_insert_user(conn, 100, "t@example.com", "RMX-TCH-000184")
    _raw_insert_counter(conn, 2026, 179)
    db.session.commit()
    _migrate_up(REV_0049)
    _check_counter(db, 184)


def test_legacy_higher_than_teacher_id(migration_app):
    from backend.extensions import db
    conn = db.session.connection()
    _raw_insert_user(conn, 100, "t@example.com", "RMX-TCH-000184")
    _raw_insert_counter(conn, 2026, 500)
    db.session.commit()
    _migrate_up(REV_0049)
    _check_counter(db, 500)


def test_multiple_legacy_yearly_rows(migration_app):
    from backend.extensions import db
    conn = db.session.connection()
    for year, seq in [(2024, 30), (2025, 120), (2026, 777)]:
        _raw_insert_counter(conn, year, seq)
    db.session.commit()
    _migrate_up(REV_0049)
    _check_counter(db, 777)


def test_next_id_above_seeded_max(migration_app):
    from backend.extensions import db
    _raw_insert_counter(db.session.connection(), 2026, 999)
    db.session.commit()
    _migrate_up(REV_0049)
    _check_counter(db, 999)
    from backend.teacher_ids import generate_teacher_id
    assert generate_teacher_id() == "RMX-TCH-001000"
    assert generate_teacher_id() == "RMX-TCH-001001"
    db.session.rollback()


def test_both_sources_same(migration_app):
    from backend.extensions import db
    conn = db.session.connection()
    _raw_insert_user(conn, 100, "t@example.com", "RMX-TCH-000050")
    _raw_insert_counter(conn, 2026, 50)
    db.session.commit()
    _migrate_up(REV_0049)
    _check_counter(db, 50)


def test_invalid_teacher_id_ignored(migration_app):
    from backend.extensions import db
    conn = db.session.connection()
    _raw_insert_user(conn, 100, "t@example.com", "INVALID-123456")
    _raw_insert_counter(conn, 2026, 42)
    db.session.commit()
    _migrate_up(REV_0049)
    _check_counter(db, 42)
