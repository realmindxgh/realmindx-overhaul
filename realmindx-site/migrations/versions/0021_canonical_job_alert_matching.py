"""Use canonical locations and curriculum for job alert matching.

Revision ID: 0021_canonical_alert_matching
Revises: 0020_account_alert_checkout
Create Date: 2026-06-12
"""

import sqlalchemy as sa
from alembic import op


revision = "0021_canonical_alert_matching"
down_revision = "0020_account_alert_checkout"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("user_profiles") as batch_op:
        batch_op.add_column(sa.Column("preferred_location_ids", sa.Text(), nullable=True))

    with op.batch_alter_table("job_alert_preferences") as batch_op:
        batch_op.add_column(sa.Column("location_ids", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("curriculum", sa.Text(), nullable=True))
        batch_op.alter_column(
            "preferred_level",
            existing_type=sa.String(length=120),
            type_=sa.Text(),
            existing_nullable=True,
        )
        batch_op.alter_column(
            "employment_type",
            existing_type=sa.String(length=80),
            type_=sa.Text(),
            existing_nullable=True,
        )

    with op.batch_alter_table("jobs") as batch_op:
        batch_op.add_column(sa.Column("delivery_zone_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("curriculum", sa.String(length=180), nullable=True))
        batch_op.create_foreign_key(
            "fk_jobs_delivery_zone_id_delivery_zones",
            "delivery_zones",
            ["delivery_zone_id"],
            ["id"],
        )
        batch_op.create_index(op.f("ix_jobs_delivery_zone_id"), ["delivery_zone_id"], unique=False)
        batch_op.create_index(op.f("ix_jobs_curriculum"), ["curriculum"], unique=False)

    op.execute("UPDATE job_alert_preferences SET frequency = 'instant'")
    op.execute(
        """
        UPDATE jobs
        SET delivery_zone_id = delivery_zones.id
        FROM delivery_zones
        WHERE LOWER(TRIM(jobs.location)) = LOWER(TRIM(delivery_zones.name))
        """
    )
    op.execute(
        """
        UPDATE job_alert_preferences
        SET location_ids = CAST(delivery_zones.id AS VARCHAR)
        FROM delivery_zones
        WHERE LOWER(TRIM(job_alert_preferences.location)) = LOWER(TRIM(delivery_zones.name))
        """
    )
    op.execute(
        """
        UPDATE user_profiles
        SET preferred_location_ids = CAST(delivery_zones.id AS VARCHAR)
        FROM delivery_zones
        WHERE LOWER(TRIM(user_profiles.preferred_locations)) = LOWER(TRIM(delivery_zones.name))
        """
    )


def downgrade():
    with op.batch_alter_table("jobs") as batch_op:
        batch_op.drop_index(op.f("ix_jobs_curriculum"))
        batch_op.drop_index(op.f("ix_jobs_delivery_zone_id"))
        batch_op.drop_constraint("fk_jobs_delivery_zone_id_delivery_zones", type_="foreignkey")
        batch_op.drop_column("curriculum")
        batch_op.drop_column("delivery_zone_id")

    with op.batch_alter_table("job_alert_preferences") as batch_op:
        batch_op.alter_column(
            "employment_type",
            existing_type=sa.Text(),
            type_=sa.String(length=80),
            existing_nullable=True,
        )
        batch_op.alter_column(
            "preferred_level",
            existing_type=sa.Text(),
            type_=sa.String(length=120),
            existing_nullable=True,
        )
        batch_op.drop_column("curriculum")
        batch_op.drop_column("location_ids")

    with op.batch_alter_table("user_profiles") as batch_op:
        batch_op.drop_column("preferred_location_ids")
