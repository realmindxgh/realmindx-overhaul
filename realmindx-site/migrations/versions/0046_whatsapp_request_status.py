"""Track WhatsApp contact verification request status.

Revision ID: 0046_whatsapp_request_status
Revises: 0045_whatsapp_pending_lock
Create Date: 2026-07-23
"""

from alembic import op
import sqlalchemy as sa


revision = "0046_whatsapp_request_status"
down_revision = "0045_whatsapp_pending_lock"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("contact_change_tokens", schema=None) as batch_op:
        batch_op.add_column(sa.Column("status", sa.String(length=30), nullable=False, server_default="pending"))
        batch_op.add_column(sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.create_index("ix_contact_change_tokens_status", ["status"], unique=False)

    with op.batch_alter_table("contact_change_tokens", schema=None) as batch_op:
        batch_op.alter_column("status", server_default=None)


def downgrade():
    with op.batch_alter_table("contact_change_tokens", schema=None) as batch_op:
        batch_op.drop_index("ix_contact_change_tokens_status")
        batch_op.drop_column("verified_at")
        batch_op.drop_column("status")
