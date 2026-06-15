"""Add flyer of focus selection.

Revision ID: 0025_flyer_focus
Revises: 0024_order_reviews
Create Date: 2026-06-15
"""

import sqlalchemy as sa
from alembic import op


revision = "0025_flyer_focus"
down_revision = "0024_order_reviews"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "flyers",
        sa.Column("is_focus", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("flyers", "is_focus", server_default=None)


def downgrade():
    op.drop_column("flyers", "is_focus")
