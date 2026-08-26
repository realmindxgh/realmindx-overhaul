"""Add contact_groups and contact_group_members tables.

Revision ID: 0061_contact_groups
Revises: 0060_newsletter_drafts
"""

from alembic import op
import sqlalchemy as sa


revision = "0061_contact_groups"
down_revision = "0060_newsletter_drafts"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "contact_groups",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "contact_group_members",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("contact_groups.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("contact_id", sa.Integer(), sa.ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("group_id", "contact_id", name="uq_contact_group_member"),
    )


def downgrade():
    op.drop_table("contact_group_members")
    op.drop_table("contact_groups")
