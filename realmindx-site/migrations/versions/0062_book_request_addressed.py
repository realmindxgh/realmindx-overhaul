"""Add addressed status workflow field to book requests.

Adds an admin-authored note recorded when a book request is marked
as addressed (handled without attaching an available product).

Revision ID: 0062_book_request_addressed
Revises: 0061_contact_groups
"""

from alembic import op
import sqlalchemy as sa


revision = "0062_book_request_addressed"
down_revision = "0061_contact_groups"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("book_requests", sa.Column("addressed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("book_requests", sa.Column("addressed_note", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("book_requests", "addressed_note")
    op.drop_column("book_requests", "addressed_at")
