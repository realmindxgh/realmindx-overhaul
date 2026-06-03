"""Add product supplier source.

Revision ID: 0004_product_source
Revises: 0003_flyers
Create Date: 2026-05-31
"""

from alembic import op
import sqlalchemy as sa


revision = "0004_product_source"
down_revision = "0003_flyers"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("products", sa.Column("source", sa.String(180), nullable=True))


def downgrade():
    op.drop_column("products", "source")
