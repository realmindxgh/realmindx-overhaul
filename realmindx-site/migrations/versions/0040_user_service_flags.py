"""Track teacher and bookshop service participation on one shared user.

Revision ID: 0040_user_service_flags
Revises: 0039_resource_library
"""

from alembic import op
import sqlalchemy as sa


revision = "0040_user_service_flags"
down_revision = "0039_resource_library"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("teacher_service_enabled", sa.Boolean(), nullable=False, server_default=sa.true()))
        batch.add_column(sa.Column("bookshop_service_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.create_index("ix_users_teacher_service_enabled", ["teacher_service_enabled"])
        batch.create_index("ix_users_bookshop_service_enabled", ["bookshop_service_enabled"])

    # Preserve every existing public user as a teacher because the old schema
    # did not record signup surface. Safely add bookshop participation wherever
    # durable bookshop activity proves it; a person may legitimately be both.
    op.execute(sa.text("""
        UPDATE users
        SET bookshop_service_enabled = true
        WHERE id IN (
            SELECT user_id FROM orders WHERE user_id IS NOT NULL
            UNION SELECT user_id FROM checkout_details WHERE user_id IS NOT NULL
        )
    """))


def downgrade():
    with op.batch_alter_table("users") as batch:
        batch.drop_index("ix_users_bookshop_service_enabled")
        batch.drop_index("ix_users_teacher_service_enabled")
        batch.drop_column("bookshop_service_enabled")
        batch.drop_column("teacher_service_enabled")
