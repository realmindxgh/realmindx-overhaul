"""Add newsletter_drafts table for auto-save draft persistence.

Revision ID: 0060_newsletter_drafts
Revises: 0059_sms_unknown_count
"""

from alembic import op
import sqlalchemy as sa


revision = "0060_newsletter_drafts"
down_revision = "0059_sms_unknown_count"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "newsletter_drafts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("channel", sa.String(20), nullable=False, server_default="email"),
        sa.Column("subject", sa.String(255), nullable=False, server_default=""),
        sa.Column("title", sa.String(255), nullable=False, server_default=""),
        sa.Column("brand", sa.String(40), nullable=False, server_default="realmindx"),
        sa.Column("sender", sa.String(40), nullable=False, server_default="news"),
        sa.Column("sms_sender_id", sa.String(40), nullable=True),
        sa.Column("content", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("audience", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("initiated_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table("newsletter_drafts")
