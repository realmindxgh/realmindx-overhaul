"""Add extended teacher profile preference fields.

Revision ID: 0009_teacher_profile_prefs
Revises: 0008_news_sections
Create Date: 2026-06-05
"""

from alembic import op
import sqlalchemy as sa


revision = "0009_teacher_profile_prefs"
down_revision = "0008_news_sections"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("user_profiles") as batch_op:
        batch_op.add_column(sa.Column("available_from", sa.String(length=80), nullable=True))
        batch_op.add_column(sa.Column("curriculum_experience", sa.String(length=255), nullable=True))


def downgrade():
    with op.batch_alter_table("user_profiles") as batch_op:
        batch_op.drop_column("curriculum_experience")
        batch_op.drop_column("available_from")
