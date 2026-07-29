"""Add communication_attempts table

Revision ID: 0050_communication_attempts
Revises: 0049_terms_accept
Create Date: 2026-07-28 10:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0050_communication_attempts"
down_revision = "0049_terms_accept"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "communication_attempts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True
        ),
        sa.Column("channel", sa.String(length=20), nullable=False, index=True),
        sa.Column("purpose", sa.String(length=40), nullable=False, index=True),
        sa.Column("recipient_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True, index=True),
        sa.Column("masked_destination", sa.String(length=120), nullable=True),
        sa.Column("template_name", sa.String(length=80), nullable=True),
        sa.Column("provider", sa.String(length=30), nullable=False),
        sa.Column("provider_message_id", sa.String(length=120), nullable=True, index=True),
        sa.Column("mode", sa.String(length=12), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, index=True),
        sa.Column("error_code", sa.String(length=60), nullable=True),
        sa.Column("retry_count", sa.Integer(), default=0),
        sa.Column("initiated_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("batch_id", sa.String(length=40), nullable=True, index=True),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade():
    op.drop_table("communication_attempts")
