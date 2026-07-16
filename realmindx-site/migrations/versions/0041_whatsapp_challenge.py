"""Record contact verification delivery channel.

Revision ID: 0041_whatsapp_challenge
Revises: 0040_user_service_flags
"""

from alembic import op
import sqlalchemy as sa


revision = "0041_whatsapp_challenge"
down_revision = "0040_user_service_flags"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("contact_change_tokens") as batch:
        batch.add_column(
            sa.Column(
                "delivery_channel",
                sa.String(length=30),
                nullable=False,
                server_default="email",
            )
        )
        batch.add_column(sa.Column("last_whatsapp_attempt_from", sa.String(length=40), nullable=True))
        batch.add_column(sa.Column("last_whatsapp_attempt_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("last_whatsapp_attempt_status", sa.String(length=40), nullable=True))
        batch.create_index("ix_contact_change_tokens_delivery_channel", ["delivery_channel"])


def downgrade():
    with op.batch_alter_table("contact_change_tokens") as batch:
        batch.drop_index("ix_contact_change_tokens_delivery_channel")
        batch.drop_column("last_whatsapp_attempt_status")
        batch.drop_column("last_whatsapp_attempt_at")
        batch.drop_column("last_whatsapp_attempt_from")
        batch.drop_column("delivery_channel")
