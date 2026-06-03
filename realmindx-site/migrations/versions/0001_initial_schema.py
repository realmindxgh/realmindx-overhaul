"""Initial RealMindX schema.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-05-25
"""

from alembic import op
from flask import current_app


revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def _metadata():
    return current_app.extensions["migrate"].db.metadata


def upgrade():
    _metadata().create_all(bind=op.get_bind())


def downgrade():
    _metadata().drop_all(bind=op.get_bind())
