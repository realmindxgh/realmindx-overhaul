"""Add teacher_id_issued_at column and teacher_id_global_counter table

Revision ID: 61edc4bf3e6f
Revises: 0048_teacher_identity_foundation
Create Date: 2026-07-25 20:28:25.651151

"""

from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "61edc4bf3e6f"
down_revision = "0048_teacher_identity_foundation"
branch_labels = None
depends_on = None


def upgrade():
    # ---- teacher_id_issued_at on users ----
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("teacher_id_issued_at", sa.DateTime(timezone=True), nullable=True))

    # ---- teacher_id_global_counter table ----
    op.create_table(
        "teacher_id_global_counter",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("last_teacher_seq", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    # ---- seed initial counter from existing teacher ID and legacy data ----
    _seed_global_counter()


def _seed_global_counter():
    """Seed the global counter to the highest known Teacher ID sequence.

    Uses the GREATER of:
    - the highest numeric suffix from existing ``users.teacher_id`` values
      matching ``RMX-TCH-NNNNNN``
    - the highest ``last_teacher_seq`` across all legacy
      ``teacher_id_counters`` rows

    If neither source contains a value the counter starts at 0.
    The singleton row is always inserted with ``id = 1``.
    """
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    if "users" not in tables:
        return

    max_from_teacher_ids = conn.execute(
        sa.text(
            "SELECT MAX(CAST(SUBSTR(teacher_id, 9) AS INTEGER)) FROM users "
            "WHERE teacher_id IS NOT NULL AND teacher_id LIKE 'RMX-TCH-%'"
        )
    ).scalar() or 0

    max_from_legacy = 0
    if "teacher_id_counters" in tables:
        max_from_legacy = conn.execute(
            sa.text("SELECT MAX(last_teacher_seq) FROM teacher_id_counters")
        ).scalar() or 0

    start = max(max_from_teacher_ids, max_from_legacy)
    now = datetime.now(timezone.utc)
    conn.execute(
        sa.text(
            "INSERT INTO teacher_id_global_counter "
            "(id, last_teacher_seq, created_at, updated_at) "
            "VALUES (1, :seq, :now, :now)"
        ),
        {"seq": start, "now": now},
    )


def downgrade():
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("teacher_id_issued_at")

    op.drop_table("teacher_id_global_counter")
