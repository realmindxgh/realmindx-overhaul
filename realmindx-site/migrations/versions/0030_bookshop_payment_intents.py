"""Separate Paystack payment attempts from placed bookshop orders.

Revision ID: 0030_bookshop_payment_intents
Revises: 0029_account_email_two_factor
Create Date: 2026-06-22
"""

import sqlalchemy as sa
from alembic import op


revision = "0030_bookshop_payment_intents"
down_revision = "0029_account_email_two_factor"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "bookshop_payment_intents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("reference", sa.String(length=80), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("customer_name", sa.String(length=160), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=40), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="GHS"),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="initialized"),
        sa.Column("provider", sa.String(length=40), nullable=False, server_default="paystack"),
        sa.Column("access_code", sa.String(length=120), nullable=True),
        sa.Column("authorization_url", sa.String(length=500), nullable=True),
        sa.Column("checkout_data", sa.JSON(), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_bookshop_payment_intents_reference"),
        "bookshop_payment_intents",
        ["reference"],
        unique=True,
    )
    op.create_index(
        op.f("ix_bookshop_payment_intents_user_id"),
        "bookshop_payment_intents",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_bookshop_payment_intents_order_id"),
        "bookshop_payment_intents",
        ["order_id"],
        unique=True,
    )
    op.create_index(
        op.f("ix_bookshop_payment_intents_email"),
        "bookshop_payment_intents",
        ["email"],
        unique=False,
    )
    op.create_index(
        op.f("ix_bookshop_payment_intents_status"),
        "bookshop_payment_intents",
        ["status"],
        unique=False,
    )


def downgrade():
    op.drop_index(op.f("ix_bookshop_payment_intents_status"), table_name="bookshop_payment_intents")
    op.drop_index(op.f("ix_bookshop_payment_intents_email"), table_name="bookshop_payment_intents")
    op.drop_index(op.f("ix_bookshop_payment_intents_order_id"), table_name="bookshop_payment_intents")
    op.drop_index(op.f("ix_bookshop_payment_intents_user_id"), table_name="bookshop_payment_intents")
    op.drop_index(op.f("ix_bookshop_payment_intents_reference"), table_name="bookshop_payment_intents")
    op.drop_table("bookshop_payment_intents")
