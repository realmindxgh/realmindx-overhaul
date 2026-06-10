"""Widen multi-select profile/job-alert columns from String(N) to Text.

Revision ID: 0017_widen_multiselect_columns
Revises: 0016_news_display_date
Create Date: 2026-06-08

teaching_subject, preferred_level, preferred_employment_type and
curriculum_experience are multi-select fields that store a comma-joined list
of values (e.g. "Mathematics, Physics, Chemistry"), and the official option
lists behind them are being replaced with longer, more numerous entries (the
new curriculum and school-level names alone run 20-40 characters each, and
"Other" lets a teacher append arbitrary custom text on top). Selecting just a
handful of the new options can already exceed the old String(160)/String(255)/
String(120)/String(80) limits, which would silently truncate on save (or hard
-error depending on the driver). Converting these to unbounded Text removes
that ceiling entirely so option lists can keep growing without ever revisiting
column widths again.

job_alert_preferences.subject receives a direct copy of teaching_subject (see
_sync_profile_to_alert_preference in api/profile.py), so it is widened the
same way to stay consistent with whatever it is seeded from.
"""

import sqlalchemy as sa
from alembic import op


revision = "0017_widen_multiselect_columns"
down_revision = "0016_news_display_date"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("user_profiles") as batch_op:
        batch_op.alter_column("teaching_subject", existing_type=sa.String(length=160), type_=sa.Text(), existing_nullable=True)
        batch_op.alter_column("preferred_level", existing_type=sa.String(length=120), type_=sa.Text(), existing_nullable=True)
        batch_op.alter_column("preferred_employment_type", existing_type=sa.String(length=80), type_=sa.Text(), existing_nullable=True)
        batch_op.alter_column("curriculum_experience", existing_type=sa.String(length=255), type_=sa.Text(), existing_nullable=True)

    with op.batch_alter_table("job_alert_preferences") as batch_op:
        batch_op.alter_column("subject", existing_type=sa.String(length=160), type_=sa.Text(), existing_nullable=True)


def downgrade():
    with op.batch_alter_table("job_alert_preferences") as batch_op:
        batch_op.alter_column("subject", existing_type=sa.Text(), type_=sa.String(length=160), existing_nullable=True)

    with op.batch_alter_table("user_profiles") as batch_op:
        batch_op.alter_column("curriculum_experience", existing_type=sa.Text(), type_=sa.String(length=255), existing_nullable=True)
        batch_op.alter_column("preferred_employment_type", existing_type=sa.Text(), type_=sa.String(length=80), existing_nullable=True)
        batch_op.alter_column("preferred_level", existing_type=sa.Text(), type_=sa.String(length=120), existing_nullable=True)
        batch_op.alter_column("teaching_subject", existing_type=sa.Text(), type_=sa.String(length=160), existing_nullable=True)
