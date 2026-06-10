"""Add responsibilities column to jobs.

Revision ID: 0019_job_responsibilities
Revises: 0018_next_of_kin_email
Create Date: 2026-06-10

The public job detail modal renders a "Responsibilities" section
(JobsPage.jsx), but the Job model never had a column to store it, so the
section was always empty for real (non-sample) jobs. This adds the missing
column so it can be set from the admin job form, serialized, and displayed.
"""

import sqlalchemy as sa
from alembic import op


revision = "0019_job_responsibilities"
down_revision = "0018_next_of_kin_email"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("jobs") as batch_op:
        batch_op.add_column(sa.Column("responsibilities", sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table("jobs") as batch_op:
        batch_op.drop_column("responsibilities")
