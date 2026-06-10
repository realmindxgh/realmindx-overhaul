"""Add next_of_kin_email column to user_profiles.

Revision ID: 0018_next_of_kin_email
Revises: 0017_widen_multiselect_columns
Create Date: 2026-06-10

The UserProfile model, profile serializer, and profile-update allowlist were
already extended with next_of_kin_email in a prior change, but the column was
never added to the database. Every query that loads a UserProfile (including
login's user_json()) selects this column, so without it every such query
fails with UndefinedColumn — breaking login site-wide.
"""

import sqlalchemy as sa
from alembic import op


revision = "0018_next_of_kin_email"
down_revision = "0017_widen_multiselect_columns"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("user_profiles") as batch_op:
        batch_op.add_column(sa.Column("next_of_kin_email", sa.String(length=255), nullable=True))


def downgrade():
    with op.batch_alter_table("user_profiles") as batch_op:
        batch_op.drop_column("next_of_kin_email")
