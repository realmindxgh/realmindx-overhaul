"""Add teacher management permissions and repair approved Teacher IDs.

Revision ID: 0052_teacher_controls
Revises: 0051_teacher_app_id_backfill
"""

import re
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


revision = "0052_teacher_controls"
down_revision = "0051_teacher_app_id_backfill"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    tables = set(sa.inspect(conn).get_table_names())
    now = datetime.now(timezone.utc)
    if {"permissions", "roles", "role_permissions"}.issubset(tables):
        keys = (
            "teachers.account.manage",
            "teachers.documents.manage",
            "teachers.verification.manage",
        )
        admin_id = conn.execute(sa.text("SELECT id FROM roles WHERE name = 'admin'")).scalar()
        for key in keys:
            permission_id = conn.execute(sa.text("SELECT id FROM permissions WHERE key = :key"), {"key": key}).scalar()
            if not permission_id:
                conn.execute(sa.text(
                    "INSERT INTO permissions (key, description, created_at, updated_at) VALUES (:key, :description, :now, :now)"
                ), {"key": key, "description": key.replace(".", " ").title(), "now": now})
                permission_id = conn.execute(sa.text("SELECT id FROM permissions WHERE key = :key"), {"key": key}).scalar()
            if admin_id:
                exists = conn.execute(sa.text(
                    "SELECT 1 FROM role_permissions WHERE role_id = :role_id AND permission_id = :permission_id"
                ), {"role_id": admin_id, "permission_id": permission_id}).scalar()
                if not exists:
                    conn.execute(sa.text(
                        "INSERT INTO role_permissions (role_id, permission_id) VALUES (:role_id, :permission_id)"
                    ), {"role_id": admin_id, "permission_id": permission_id})

    required = {"users", "user_profiles", "teacher_id_global_counter"}
    if not required.issubset(tables):
        return
    valid_pattern = re.compile(r"^RMX-TCH-(\d{6})$")
    ids = conn.execute(sa.text("SELECT teacher_id FROM users WHERE teacher_id IS NOT NULL")).scalars()
    highest = max((int(match.group(1)) for value in ids if (match := valid_pattern.fullmatch(str(value or "")))), default=0)
    counter = conn.execute(sa.text("SELECT last_teacher_seq FROM teacher_id_global_counter WHERE id = 1")).scalar()
    sequence = max(highest, int(counter or 0))
    if counter is None:
        conn.execute(sa.text(
            "INSERT INTO teacher_id_global_counter (id, last_teacher_seq, created_at, updated_at) VALUES (1, :sequence, :now, :now)"
        ), {"sequence": sequence, "now": now})
    rows = conn.execute(sa.text(
        """SELECT u.id, u.teacher_id FROM users u JOIN user_profiles p ON p.user_id = u.id
           WHERE p.profile_status = 'verified' ORDER BY p.reviewed_at ASC, u.id ASC"""
    )).fetchall()
    for user_id, teacher_id in rows:
        if valid_pattern.fullmatch(str(teacher_id or "")):
            continue
        sequence += 1
        conn.execute(sa.text(
            "UPDATE users SET teacher_id = :teacher_id, teacher_id_issued_at = COALESCE(teacher_id_issued_at, :now), updated_at = :now WHERE id = :user_id"
        ), {"teacher_id": f"RMX-TCH-{sequence:06d}", "now": now, "user_id": user_id})
    conn.execute(sa.text(
        "UPDATE teacher_id_global_counter SET last_teacher_seq = :sequence, updated_at = :now WHERE id = 1"
    ), {"sequence": sequence, "now": now})


def downgrade():
    # Teacher IDs and audit-related permissions are durable; do not revoke them.
    pass
