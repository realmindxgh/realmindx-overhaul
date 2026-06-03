"""Add bulk discount fields to product_categories.

Revision ID: 0004_bulk_discount
Revises: 0003_flyers
Create Date: 2026-06-02
"""

from alembic import op
import sqlalchemy as sa


revision = "0004_bulk_discount"
down_revision = "0003_flyers"
branch_labels = None
depends_on = None


def upgrade():
    # SQLite requires ALTER TABLE one column at a time
    with op.batch_alter_table("product_categories") as batch_op:
        batch_op.add_column(sa.Column("bulk_discount_percent", sa.Numeric(5, 2), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("bulk_min_qty", sa.Integer, nullable=False, server_default="10"))


def downgrade():
    with op.batch_alter_table("product_categories") as batch_op:
        batch_op.drop_column("bulk_discount_percent")
        batch_op.drop_column("bulk_min_qty")
