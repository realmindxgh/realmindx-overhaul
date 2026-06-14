"""Require password rotation for new internal accounts.

Revision ID: 0023_password_rotation
Revises: 0022_analytics_foundation
Create Date: 2026-06-14
"""

import sqlalchemy as sa
from alembic import op


revision = "0023_password_rotation"
down_revision = "0022_analytics_foundation"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users",
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.execute("UPDATE users SET must_change_password = FALSE")
    op.alter_column("users", "must_change_password", server_default=None)


def downgrade():
    op.drop_column("users", "must_change_password")
