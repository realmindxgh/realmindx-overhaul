"""Add source attribution to education resources.

Revision ID: 0033_resource_source
Revises: 0032_cart_invoices
Create Date: 2026-06-30
"""

import sqlalchemy as sa
from alembic import op


revision = "0033_resource_source"
down_revision = "0032_cart_invoices"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("resources") as batch_op:
        batch_op.add_column(sa.Column("source", sa.String(length=160), nullable=True))


def downgrade():
    with op.batch_alter_table("resources") as batch_op:
        batch_op.drop_column("source")
