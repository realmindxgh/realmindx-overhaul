"""Add display_date to news.

Revision ID: 0016_news_display_date
Revises: 0015_account_lockout
Create Date: 2026-06-07

Adds an optional, editor-controlled "Display Date" to news posts
  - display_date (Date) — distinct from published_at, which is an automatic
    system stamp set the moment a post's status flips to "published"
"""

import sqlalchemy as sa
from alembic import op


revision = "0016_news_display_date"
down_revision = "0015_account_lockout"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("news", sa.Column("display_date", sa.Date(), nullable=True))


def downgrade():
    op.drop_column("news", "display_date")
