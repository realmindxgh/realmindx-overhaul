"""Add sectioned article content to news posts.

Revision ID: 0008_news_sections
Revises: 0007_product_metadata_reviews
Create Date: 2026-06-02
"""

from alembic import op
import sqlalchemy as sa


revision = "0008_news_sections"
down_revision = "0007_product_metadata_reviews"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("news") as batch_op:
        batch_op.add_column(sa.Column("sections", sa.JSON(), nullable=False, server_default="[]"))
    with op.batch_alter_table("news") as batch_op:
        batch_op.alter_column("sections", server_default=None)


def downgrade():
    with op.batch_alter_table("news") as batch_op:
        batch_op.drop_column("sections")
