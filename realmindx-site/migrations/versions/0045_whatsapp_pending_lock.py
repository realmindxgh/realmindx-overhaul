"""Add active lock for WhatsApp phone verification.

Revision ID: 0045_whatsapp_pending_lock
Revises: 0044_phone_verified_at
Create Date: 2026-07-23 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0045_whatsapp_pending_lock"
down_revision = "0044_phone_verified_at"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("contact_change_tokens", schema=None) as batch_op:
        batch_op.add_column(sa.Column("active_lock_key", sa.String(length=255), nullable=True))
    op.create_index("uq_active_whatsapp_phone", "contact_change_tokens", ["active_lock_key"], unique=True)


def downgrade():
    op.drop_index("uq_active_whatsapp_phone", table_name="contact_change_tokens")
    with op.batch_alter_table("contact_change_tokens", schema=None) as batch_op:
        batch_op.drop_column("active_lock_key")
