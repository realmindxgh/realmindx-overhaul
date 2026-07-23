"""Track phone verification time and WhatsApp webhook idempotency.

Revision ID: 0044_phone_verified_at
Revises: 0043_product_image_variants
Create Date: 2026-07-23
"""

from alembic import op
import sqlalchemy as sa


revision = "0044_phone_verified_at"
down_revision = "0043_product_image_variants"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("phone_verified_at", sa.DateTime(timezone=True), nullable=True))

    op.create_index(
        "ix_whatsapp_webhook_events_message_id_unique",
        "whatsapp_webhook_events",
        ["message_id"],
        unique=True,
    )


def downgrade():
    op.drop_index("ix_whatsapp_webhook_events_message_id_unique", table_name="whatsapp_webhook_events")

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("phone_verified_at")
