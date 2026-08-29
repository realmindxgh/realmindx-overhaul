"""Add addressed status workflow field to book requests.

Adds fields recorded when a book request is marked as addressed (handled
without attaching an available product). The addressed_at index is managed
explicitly here so SQLite can downgrade cleanly (an indexed column cannot
be dropped without dropping its index first).

Revision ID: 0062_book_request_addressed
Revises: 0061_contact_groups
"""

from alembic import op
import sqlalchemy as sa


revision = "0062_book_request_addressed"
down_revision = "0061_contact_groups"
branch_labels = None
depends_on = None


ADDRESSED_AT_INDEX = "ix_book_requests_addressed_at"


def upgrade():
    op.add_column("book_requests", sa.Column("addressed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("book_requests", sa.Column("addressed_note", sa.Text(), nullable=True))
    op.create_index(ADDRESSED_AT_INDEX, "book_requests", ["addressed_at"])


def downgrade():
    op.drop_index(ADDRESSED_AT_INDEX, table_name="book_requests")
    op.drop_column("book_requests", "addressed_note")
    op.drop_column("book_requests", "addressed_at")
