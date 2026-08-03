"""Backfill missing or malformed teacher application IDs.

Revision ID: 0051_teacher_app_id_backfill
Revises: 0050_communication_attempts
Create Date: 2026-08-03
"""

import re
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


revision = "0051_teacher_app_id_backfill"
down_revision = "0050_communication_attempts"
branch_labels = None
depends_on = None

APPLICATION_ID_PATTERN = re.compile(r"^RMX-APP-\d{4}-\d{6}$")


def upgrade():
    """Assign an RMX application ID to every teacher-service account.

    The original identity migration covered accounts that existed at that
    time. OAuth-created accounts and bookshop accounts that later enabled the
    teacher service could bypass that one-time backfill. This repair is
    idempotent and also synchronises the current-year sequence with every
    valid ID already stored in the users table.
    """
    conn = op.get_bind()
    tables = set(sa.inspect(conn).get_table_names())
    required = {"users", "roles", "teacher_id_counters"}
    if not required.issubset(tables):
        return

    teacher_rows = conn.execute(
        sa.text(
            """SELECT u.id, u.application_id
               FROM users u
               JOIN roles r ON r.id = u.role_id
               WHERE r.name = 'user' AND u.teacher_service_enabled = true
               ORDER BY u.created_at ASC, u.id ASC"""
        )
    ).fetchall()
    targets = [
        row for row in teacher_rows
        if not APPLICATION_ID_PATTERN.fullmatch(str(row[1] or ""))
    ]

    now = datetime.now(timezone.utc)
    year = now.year
    current_year_pattern = re.compile(rf"^RMX-APP-{year}-(\d{{6}})$")
    all_application_ids = conn.execute(
        sa.text("SELECT application_id FROM users WHERE application_id IS NOT NULL")
    ).scalars()
    max_existing_sequence = 0
    for application_id in all_application_ids:
        match = current_year_pattern.fullmatch(str(application_id or ""))
        if match:
            max_existing_sequence = max(max_existing_sequence, int(match.group(1)))

    counter_row = conn.execute(
        sa.text(
            "SELECT id, last_application_seq FROM teacher_id_counters WHERE year = :year"
        ),
        {"year": year},
    ).fetchone()
    last_sequence = max(
        max_existing_sequence,
        int(counter_row[1] or 0) if counter_row else 0,
    )

    if not counter_row:
        conn.execute(
            sa.text(
                """INSERT INTO teacher_id_counters
                   (year, last_application_seq, last_teacher_seq, created_at, updated_at)
                   VALUES (:year, :sequence, 0, :now, :now)"""
            ),
            {"year": year, "sequence": last_sequence, "now": now},
        )

    for row in targets:
        last_sequence += 1
        conn.execute(
            sa.text(
                "UPDATE users SET application_id = :application_id WHERE id = :user_id"
            ),
            {
                "application_id": f"RMX-APP-{year}-{last_sequence:06d}",
                "user_id": row[0],
            },
        )

    conn.execute(
        sa.text(
            """UPDATE teacher_id_counters
               SET last_application_seq = :sequence, updated_at = :now
               WHERE year = :year"""
        ),
        {"sequence": last_sequence, "now": now, "year": year},
    )


def downgrade():
    # Assigned application IDs are durable external references and must not be
    # removed during a rollback.
    pass
