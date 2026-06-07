"""account_lockout: add locked_until to users for login lockout enforcement

Revision ID: 0015_account_lockout
Revises: 0014_newsletter_unsubscribe
Create Date: 2026-06-07
"""
import sqlalchemy as sa
from alembic import op

revision = "0015_account_lockout"
down_revision = "0014_newsletter_unsubscribe"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("locked_until")
