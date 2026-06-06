"""Add years_of_experience and date_of_birth to user_profiles.

Revision ID: 0012_teacher_experience_dob
Revises: 0011_seed_map_embed_setting
Create Date: 2026-06-06

Adds two optional fields to the teacher/user profile:
  - years_of_experience (Integer) — self-reported teaching experience
  - date_of_birth (Date) — used to compute age in admin view
"""

import sqlalchemy as sa
from alembic import op


revision = "0012_teacher_experience_dob"
down_revision = "0011_seed_map_embed_setting"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("user_profiles") as batch_op:
        batch_op.add_column(sa.Column("years_of_experience", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("date_of_birth", sa.Date(), nullable=True))


def downgrade():
    with op.batch_alter_table("user_profiles") as batch_op:
        batch_op.drop_column("date_of_birth")
        batch_op.drop_column("years_of_experience")
