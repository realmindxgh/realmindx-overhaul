"""Seed contact & site detail settings.

Revision ID: 0010_seed_contact_settings
Revises: 0009_teacher_profile_prefs
Create Date: 2026-06-06
"""

import json
import sqlalchemy as sa
from alembic import op


revision = "0010_seed_contact_settings"
down_revision = "0009_teacher_profile_prefs"
branch_labels = None
depends_on = None

CONTACT_SETTINGS = [
    ("contact_email",           "info@realmindxgh.com"),
    ("contact_phone_1",         "+233 55 803 9190"),
    ("contact_phone_2",         "+233 55 452 9493"),
    ("contact_phone_3",         "+233 55 132 4729"),
    ("contact_address",         "Dome Pillar 2, Accra, Ghana"),
    ("working_hours_weekday",   "Monday - Friday: 8:00am - 5:00pm"),
    ("working_hours_saturday",  "Saturday: 9:00am - 1:00pm"),
]


def upgrade():
    conn = op.get_bind()
    for key, value in CONTACT_SETTINGS:
        # Use ON CONFLICT to avoid the psycopg3 AmbiguousParameter error that
        # arises when the same :key param appears in both the SELECT list and a
        # WHERE NOT EXISTS sub-select (psycopg3 infers 'text' vs 'character
        # varying' for the two occurrences and refuses to reconcile them).
        # CAST(:value AS json) is required because psycopg3 won't coerce a plain
        # Python string into a json column without an explicit type hint.
        # TimestampMixin.created_at/updated_at use Python-level SQLAlchemy
        # defaults (default=utcnow), NOT PostgreSQL DEFAULT clauses. Raw SQL
        # INSERT bypasses the ORM, so PostgreSQL sees NULL for those columns
        # and raises NotNullViolation. Supply NOW() explicitly.
        conn.execute(
            sa.text(
                "INSERT INTO site_settings (key, value, public, created_at, updated_at) "
                "VALUES (:key, CAST(:value AS json), TRUE, NOW(), NOW()) "
                "ON CONFLICT (key) DO NOTHING"
            ),
            {"key": key, "value": json.dumps(value)},
        )


def downgrade():
    conn = op.get_bind()
    keys = [key for key, _ in CONTACT_SETTINGS]
    for key in keys:
        conn.execute(
            sa.text("DELETE FROM site_settings WHERE key = :key"),
            {"key": key},
        )
