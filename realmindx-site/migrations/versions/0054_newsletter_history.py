"""Add newsletter campaign history and correct category bulk discounts.

Revision ID: 0054_newsletter_history
Revises: 0053_contact_audience
"""

from alembic import op
import sqlalchemy as sa


revision = "0054_newsletter_history"
down_revision = "0053_contact_audience"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "newsletter_campaigns",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("brand", sa.String(length=40), nullable=False, server_default="realmindx"),
        sa.Column("sender", sa.String(length=40), nullable=False, server_default="news"),
        sa.Column("content", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("audience", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("recipient_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sent_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("mocked_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="completed"),
        sa.Column("initiated_by", sa.Integer(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["initiated_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_newsletter_campaigns_status", "newsletter_campaigns", ["status"])
    op.create_index("ix_newsletter_campaigns_sent_at", "newsletter_campaigns", ["sent_at"])
    op.execute(sa.text(
        "UPDATE product_categories SET bulk_discount_percent = 10, bulk_min_qty = 10 "
        "WHERE slug IN ('textbooks', 'work-books')"
    ))


def downgrade():
    op.drop_index("ix_newsletter_campaigns_sent_at", table_name="newsletter_campaigns")
    op.drop_index("ix_newsletter_campaigns_status", table_name="newsletter_campaigns")
    op.drop_table("newsletter_campaigns")
