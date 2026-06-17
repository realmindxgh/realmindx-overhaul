"""Persist order pricing breakdown and promo scope.

Revision ID: 0027_order_pricing_promos
Revises: 0026_delivery_zone_aliases
Create Date: 2026-06-17
"""

import sqlalchemy as sa
from alembic import op


revision = "0027_order_pricing_promos"
down_revision = "0026_delivery_zone_aliases"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("orders") as batch_op:
        batch_op.add_column(sa.Column("bulk_discount_amount", sa.Numeric(12, 2), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("promo_code", sa.String(length=40), nullable=True))
        batch_op.add_column(sa.Column("promo_applies_to", sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column("promo_discount_amount", sa.Numeric(12, 2), nullable=False, server_default="0"))


def downgrade():
    with op.batch_alter_table("orders") as batch_op:
        batch_op.drop_column("promo_discount_amount")
        batch_op.drop_column("promo_applies_to")
        batch_op.drop_column("promo_code")
        batch_op.drop_column("bulk_discount_amount")
