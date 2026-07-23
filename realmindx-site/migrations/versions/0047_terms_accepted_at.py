"""Add terms_accepted_at to users for social login terms modal.

Revision ID: 0047_terms_accepted_at
Revises: 0046_whatsapp_request_status
Create Date: 2026-07-23
"""

from alembic import op
import sqlalchemy as sa


revision = "0047_terms_accepted_at"
down_revision = "0046_whatsapp_request_status"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("terms_accepted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("terms_accepted_at")
