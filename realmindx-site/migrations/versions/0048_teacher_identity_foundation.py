"""Add teacher identity fields: application_id, teacher_id, profile review columns, counter table.

Revision ID: 0048_teacher_identity_foundation
Revises: 0047_terms_accepted_at
Create Date: 2026-07-25
"""

from alembic import op
import sqlalchemy as sa

revision = "0048_teacher_identity_foundation"
down_revision = "0047_terms_accepted_at"
branch_labels = None
depends_on = None


def upgrade():
    # ---- users ----
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("application_id", sa.String(30), nullable=True))
        batch_op.add_column(sa.Column("teacher_id", sa.String(30), nullable=True))
        batch_op.create_index("ix_users_application_id", ["application_id"], unique=True)
        batch_op.create_index("ix_users_teacher_id", ["teacher_id"], unique=True)

    # ---- user_profiles ----
    with op.batch_alter_table("user_profiles", schema=None) as batch_op:
        batch_op.add_column(sa.Column("profile_status", sa.String(30), server_default="incomplete", nullable=False))
        batch_op.add_column(sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("reviewed_by_id", sa.Integer, nullable=True))
        batch_op.add_column(sa.Column("review_notes", sa.Text, nullable=True))
        batch_op.create_index("ix_user_profiles_profile_status", ["profile_status"])
        batch_op.create_foreign_key(
            "fk_user_profiles_reviewed_by",
            "users",
            ["reviewed_by_id"],
            ["id"],
        )

    # ---- teacher_id_counters ----
    op.create_table(
        "teacher_id_counters",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("last_application_seq", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_teacher_seq", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("year", name="uq_teacher_id_counters_year"),
    )
    op.create_index("ix_teacher_id_counters_year", "teacher_id_counters", ["year"], unique=True)

    # ---- backfill application IDs for existing teachers ----
    _backfill_application_ids()


def _backfill_application_ids():
    """Generate application IDs for all existing teacher accounts.

    Only application IDs are generated here.  Permanent teacher IDs will be
    issued during the visual-verification review process (future phase).

    A teacher is defined as any user whose role is "user" AND whose
    ``teacher_service_enabled`` is True.
    """
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    if "teacher_id_counters" not in tables or "users" not in tables or "roles" not in tables:
        return

    rows = conn.execute(
        sa.text(
            """SELECT u.id FROM users u
               JOIN roles r ON r.id = u.role_id
               WHERE r.name = 'user' AND u.teacher_service_enabled = true
                 AND u.application_id IS NULL
               ORDER BY u.created_at ASC"""
        )
    ).fetchall()
    if not rows:
        return

    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    year = now.year

    # Ensure a counter row for this year exists.
    existing = conn.execute(
        sa.text("SELECT id FROM teacher_id_counters WHERE year = :y"), {"y": year}
    ).fetchone()

    if existing:
        # Fetch current seq value from the existing row.
        cur = conn.execute(
            sa.text("SELECT last_application_seq FROM teacher_id_counters WHERE year = :y"),
            {"y": year},
        ).scalar()
        start = (cur or 0) + 1
    else:
        start = 1
        conn.execute(
            sa.text(
                """INSERT INTO teacher_id_counters
                   (year, last_application_seq, last_teacher_seq, created_at, updated_at)
                   VALUES (:y, :seq, 0, :now, :now)"""
            ),
            {"y": year, "seq": len(rows), "now": now},
        )

    for offset, row in enumerate(rows):
        seq = start + offset
        app_id = f"RMX-APP-{year}-{seq:06d}"
        conn.execute(
            sa.text("UPDATE users SET application_id = :aid WHERE id = :uid"),
            {"aid": app_id, "uid": row[0]},
        )

    # Sync the counter to the last assigned sequence so the next
    # generate_application_id() call does not re-issue any of these IDs.
    max_seq = start + len(rows) - 1
    conn.execute(
        sa.text(
            "UPDATE teacher_id_counters SET last_application_seq = :seq WHERE year = :y"
        ),
        {"seq": max_seq, "y": year},
    )


def downgrade():
    with op.batch_alter_table("user_profiles", schema=None) as batch_op:
        batch_op.drop_constraint("fk_user_profiles_reviewed_by", type_="foreignkey")
        batch_op.drop_index("ix_user_profiles_profile_status")
        batch_op.drop_column("review_notes")
        batch_op.drop_column("reviewed_by_id")
        batch_op.drop_column("reviewed_at")
        batch_op.drop_column("submitted_at")
        batch_op.drop_column("profile_status")

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_index("ix_users_teacher_id")
        batch_op.drop_index("ix_users_application_id")
        batch_op.drop_column("teacher_id")
        batch_op.drop_column("application_id")

    op.drop_index("ix_teacher_id_counters_year", table_name="teacher_id_counters")
    op.drop_table("teacher_id_counters")
