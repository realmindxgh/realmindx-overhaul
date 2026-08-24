"""Add SMS campaigns to the Newsletter workspace.

Revision ID: 0058_newsletter_sms
Revises: 0057_writing_books_discount
"""

from alembic import op
import sqlalchemy as sa


revision = "0058_newsletter_sms"
down_revision = "0057_writing_books_discount"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("newsletter_campaigns") as batch_op:
        batch_op.add_column(
            sa.Column("channel", sa.String(length=20), nullable=False, server_default="email")
        )
        batch_op.create_index("ix_newsletter_campaigns_channel", ["channel"])

    with op.batch_alter_table("newsletter_campaign_recipients") as batch_op:
        batch_op.alter_column(
            "email",
            existing_type=sa.String(length=255),
            nullable=True,
        )
        batch_op.add_column(sa.Column("phone", sa.String(length=40), nullable=True))
        batch_op.create_unique_constraint(
            "uq_newsletter_campaign_recipient_phone",
            ["campaign_id", "phone"],
        )


def downgrade():
    # SMS recipient rows cannot satisfy the legacy non-null email constraint.
    # Removing the SMS campaigns cascades those rows before restoring the old schema.
    op.execute(sa.text("DELETE FROM newsletter_campaigns WHERE channel = 'sms'"))

    with op.batch_alter_table("newsletter_campaign_recipients") as batch_op:
        batch_op.drop_constraint(
            "uq_newsletter_campaign_recipient_phone",
            type_="unique",
        )
        batch_op.drop_column("phone")
        batch_op.alter_column(
            "email",
            existing_type=sa.String(length=255),
            nullable=False,
        )

    with op.batch_alter_table("newsletter_campaigns") as batch_op:
        batch_op.drop_index("ix_newsletter_campaigns_channel")
        batch_op.drop_column("channel")
