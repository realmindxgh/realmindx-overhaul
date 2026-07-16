"""Improve social password login hints and WhatsApp diagnostics.

Revision ID: 0042_auth_whatsapp_diag
Revises: 0041_whatsapp_challenge
"""

from alembic import op
import sqlalchemy as sa


revision = "0042_auth_whatsapp_diag"
down_revision = "0041_whatsapp_challenge"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users") as batch:
        batch.add_column(
            sa.Column(
                "password_login_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            )
        )

    op.create_table(
        "whatsapp_webhook_events",
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("message_id", sa.String(length=255), nullable=True),
        sa.Column("sender", sa.String(length=40), nullable=True),
        sa.Column("phone_number_id", sa.String(length=80), nullable=True),
        sa.Column("text_preview", sa.String(length=180), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("challenge_id", sa.Integer(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["challenge_id"], ["contact_change_tokens.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_whatsapp_webhook_events_message_id", "whatsapp_webhook_events", ["message_id"])
    op.create_index("ix_whatsapp_webhook_events_sender", "whatsapp_webhook_events", ["sender"])
    op.create_index("ix_whatsapp_webhook_events_phone_number_id", "whatsapp_webhook_events", ["phone_number_id"])
    op.create_index("ix_whatsapp_webhook_events_status", "whatsapp_webhook_events", ["status"])
    op.create_index("ix_whatsapp_webhook_events_challenge_id", "whatsapp_webhook_events", ["challenge_id"])
    op.create_index("ix_whatsapp_webhook_events_user_id", "whatsapp_webhook_events", ["user_id"])


def downgrade():
    op.drop_index("ix_whatsapp_webhook_events_user_id", table_name="whatsapp_webhook_events")
    op.drop_index("ix_whatsapp_webhook_events_challenge_id", table_name="whatsapp_webhook_events")
    op.drop_index("ix_whatsapp_webhook_events_status", table_name="whatsapp_webhook_events")
    op.drop_index("ix_whatsapp_webhook_events_phone_number_id", table_name="whatsapp_webhook_events")
    op.drop_index("ix_whatsapp_webhook_events_sender", table_name="whatsapp_webhook_events")
    op.drop_index("ix_whatsapp_webhook_events_message_id", table_name="whatsapp_webhook_events")
    op.drop_table("whatsapp_webhook_events")

    with op.batch_alter_table("users") as batch:
        batch.drop_column("password_login_enabled")
