"""Add reusable checkout details for signed-in bookshop customers.

Revision ID: 0028_checkout_details
Revises: 0027_order_pricing_promos
Create Date: 2026-06-19
"""

import sqlalchemy as sa
from alembic import op


revision = "0028_checkout_details"
down_revision = "0027_order_pricing_promos"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "checkout_details",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=True),
        sa.Column("customer_name", sa.String(length=160), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=40), nullable=False),
        sa.Column("delivery_zone_id", sa.Integer(), nullable=True),
        sa.Column("delivery_zone_name", sa.String(length=160), nullable=True),
        sa.Column("address", sa.String(length=255), nullable=True),
        sa.Column("city", sa.String(length=160), nullable=True),
        sa.Column("region", sa.String(length=80), nullable=True),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["delivery_zone_id"], ["delivery_zones.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "fingerprint", name="uq_checkout_detail_user_fingerprint"),
    )
    op.create_index(op.f("ix_checkout_details_user_id"), "checkout_details", ["user_id"], unique=False)
    op.create_index(op.f("ix_checkout_details_delivery_zone_id"), "checkout_details", ["delivery_zone_id"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_checkout_details_delivery_zone_id"), table_name="checkout_details")
    op.drop_index(op.f("ix_checkout_details_user_id"), table_name="checkout_details")
    op.drop_table("checkout_details")
