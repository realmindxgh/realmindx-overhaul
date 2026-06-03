"""Add news category.

Revision ID: 0005_news_category
Revises: 0004_product_source
Create Date: 2026-06-01
"""

from alembic import op
import sqlalchemy as sa


revision = "0005_news_category"
down_revision = "0004_product_source"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("news", sa.Column("category", sa.String(80), nullable=True))


def downgrade():
    op.drop_column("news", "category")
