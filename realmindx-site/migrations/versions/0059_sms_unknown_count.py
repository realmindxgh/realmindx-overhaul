"""Add unknown_count to newsletter_campaigns for uncertain SMS delivery outcomes.

Revision ID: 0059_sms_unknown_count
Revises: 0058_newsletter_sms
"""

from alembic import op
import sqlalchemy as sa


revision = "0059_sms_unknown_count"
down_revision = "0058_newsletter_sms"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("newsletter_campaigns") as batch_op:
        batch_op.add_column(
            sa.Column("unknown_count", sa.Integer(), nullable=False, server_default="0")
        )


def downgrade():
    with op.batch_alter_table("newsletter_campaigns") as batch_op:
        batch_op.drop_column("unknown_count")
