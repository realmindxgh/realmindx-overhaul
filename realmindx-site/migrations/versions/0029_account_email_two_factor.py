"""Add email two-factor authentication for shared RealMindX accounts.

Revision ID: 0029_account_email_two_factor
Revises: 0028_checkout_details
Create Date: 2026-06-19
"""

import sqlalchemy as sa
from alembic import op


revision = "0029_account_email_two_factor"
down_revision = "0028_checkout_details"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column("two_factor_enabled", sa.Boolean(), nullable=False, server_default=sa.false())
        )
    op.create_table(
        "account_security_codes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("purpose", sa.String(length=40), nullable=False),
        sa.Column("token_hash", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_account_security_codes_user_id"),
        "account_security_codes",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_account_security_codes_purpose"),
        "account_security_codes",
        ["purpose"],
        unique=False,
    )


def downgrade():
    op.drop_index(op.f("ix_account_security_codes_purpose"), table_name="account_security_codes")
    op.drop_index(op.f("ix_account_security_codes_user_id"), table_name="account_security_codes")
    op.drop_table("account_security_codes")
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("two_factor_enabled")
