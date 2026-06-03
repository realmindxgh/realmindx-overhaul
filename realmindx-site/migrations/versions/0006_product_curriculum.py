"""Add product curriculum.

Revision ID: 0006_product_curriculum
Revises: 0005_news_category
Create Date: 2026-06-01
"""

from alembic import op
import sqlalchemy as sa


revision = "0006_product_curriculum"
down_revision = "0005_news_category"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("products", sa.Column("curriculum", sa.String(length=160), nullable=True))
    op.create_index(op.f("ix_products_curriculum"), "products", ["curriculum"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_products_curriculum"), table_name="products")
    op.drop_column("products", "curriculum")
