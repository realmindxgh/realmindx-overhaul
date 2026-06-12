"""Add verified contacts, teacher locations, alerts, and checkout options.

Revision ID: 0020_account_alert_checkout
Revises: 0019_job_responsibilities, 0005_promo_delivery
Create Date: 2026-06-12
"""

from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op


revision = "0020_account_alert_checkout"
down_revision = ("0019_job_responsibilities", "0005_promo_delivery")
branch_labels = None
depends_on = None


OLD_DELIVERY_COPY = (
    "Orders are dispatched within 24 hours and delivered nationwide within 48 hours. "
    "Greater Accra delivery from GHS 15; other regions calculated at checkout. "
    "Free pickup available at our Dome Pillar 2 shop."
)
NEW_DELIVERY_COPY = (
    "Orders are dispatched within 24 hours and delivered nationwide within 48 hours. "
    "Free pickup is available at our Dome Pillar 2 shop."
)


def _replace_delivery_copy(bind, old_value, new_value):
    settings = sa.table(
        "site_settings",
        sa.column("id", sa.Integer),
        sa.column("key", sa.String),
        sa.column("value", sa.JSON),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    rows = bind.execute(
        sa.select(settings.c.id, settings.c.value).where(settings.c.key == "site_copy")
    ).mappings()
    for row in rows:
        items = row["value"] if isinstance(row["value"], list) else []
        changed = False
        next_items = []
        for item in items:
            next_item = dict(item)
            if next_item.get("key") == "bookshop_pdp_delivery_info" and next_item.get("value") == old_value:
                next_item["value"] = new_value
                changed = True
            next_items.append(next_item)
        if changed:
            bind.execute(
                settings.update()
                .where(settings.c.id == row["id"])
                .values(value=next_items, updated_at=datetime.now(timezone.utc))
            )


def upgrade():
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("phone_verified", sa.Boolean(), nullable=False, server_default=sa.false()))

    with op.batch_alter_table("user_profiles") as batch_op:
        batch_op.add_column(sa.Column("preferred_locations", sa.Text(), nullable=True))

    with op.batch_alter_table("job_alert_preferences") as batch_op:
        batch_op.alter_column(
            "location",
            existing_type=sa.String(length=160),
            type_=sa.Text(),
            existing_nullable=True,
        )
        batch_op.add_column(sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()))

    op.execute(
        """
        UPDATE job_alert_preferences
        SET is_default = TRUE
        WHERE id IN (
            SELECT MIN(id)
            FROM job_alert_preferences
            GROUP BY user_id
        )
        """
    )

    with op.batch_alter_table("orders") as batch_op:
        batch_op.add_column(sa.Column("delivery_region", sa.String(length=80), nullable=True))
        batch_op.add_column(sa.Column("payment_method", sa.String(length=40), nullable=False, server_default="online"))
        batch_op.create_index(op.f("ix_orders_payment_method"), ["payment_method"], unique=False)

    op.create_table(
        "contact_change_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("field", sa.String(length=20), nullable=False),
        sa.Column("target_value", sa.String(length=255), nullable=False),
        sa.Column("token_hash", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_contact_change_tokens_user_id"), "contact_change_tokens", ["user_id"], unique=False)
    op.create_index(op.f("ix_contact_change_tokens_field"), "contact_change_tokens", ["field"], unique=False)

    _replace_delivery_copy(op.get_bind(), OLD_DELIVERY_COPY, NEW_DELIVERY_COPY)


def downgrade():
    _replace_delivery_copy(op.get_bind(), NEW_DELIVERY_COPY, OLD_DELIVERY_COPY)

    op.drop_index(op.f("ix_contact_change_tokens_field"), table_name="contact_change_tokens")
    op.drop_index(op.f("ix_contact_change_tokens_user_id"), table_name="contact_change_tokens")
    op.drop_table("contact_change_tokens")

    with op.batch_alter_table("orders") as batch_op:
        batch_op.drop_index(op.f("ix_orders_payment_method"))
        batch_op.drop_column("payment_method")
        batch_op.drop_column("delivery_region")

    with op.batch_alter_table("job_alert_preferences") as batch_op:
        batch_op.drop_column("is_default")
        batch_op.alter_column(
            "location",
            existing_type=sa.Text(),
            type_=sa.String(length=160),
            existing_nullable=True,
        )

    with op.batch_alter_table("user_profiles") as batch_op:
        batch_op.drop_column("preferred_locations")

    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("phone_verified")
