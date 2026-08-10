"""Give Writing Books the same 10% bulk discount as Textbooks and Work Books.

Revision ID: 0057_writing_books_discount
Revises: 0056_newsletter_recipients
"""

from alembic import op
import sqlalchemy as sa


revision = "0057_writing_books_discount"
down_revision = "0056_newsletter_recipients"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(sa.text(
        "UPDATE product_categories SET bulk_discount_percent = 10, bulk_min_qty = 10 "
        "WHERE slug = 'writing-books'"
    ))


def downgrade():
    op.execute(sa.text(
        "UPDATE product_categories SET bulk_discount_percent = 0, bulk_min_qty = 10 "
        "WHERE slug = 'writing-books'"
    ))
