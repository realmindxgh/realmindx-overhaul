"""Add cart-generated invoices.

Revision ID: 0032_cart_invoices
Revises: 0031_invoice_affiliate_teachers
Create Date: 2026-06-30
"""

import sqlalchemy as sa
from alembic import op


revision = "0032_cart_invoices"
down_revision = "0031_invoice_affiliate_teachers"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "cart_invoices",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("invoice_id", sa.String(length=40), nullable=False),
        sa.Column("subtotal_amount", sa.Numeric(precision=12, scale=2), nullable=False, server_default="0"),
        sa.Column("bulk_discount_amount", sa.Numeric(precision=12, scale=2), nullable=False, server_default="0"),
        sa.Column("promo_code", sa.String(length=40), nullable=True),
        sa.Column("promo_applies_to", sa.String(length=20), nullable=True),
        sa.Column("promo_discount_amount", sa.Numeric(precision=12, scale=2), nullable=False, server_default="0"),
        sa.Column("delivery_fee", sa.Numeric(precision=12, scale=2), nullable=False, server_default="0"),
        sa.Column("total_amount", sa.Numeric(precision=12, scale=2), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="generated"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_cart_invoices_invoice_id", "cart_invoices", ["invoice_id"], unique=True)
    op.create_index("ix_cart_invoices_status", "cart_invoices", ["status"])

    op.create_table(
        "cart_invoice_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("cart_invoice_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=True),
        sa.Column("product_name", sa.String(length=180), nullable=False),
        sa.Column("unit_price", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["cart_invoice_id"], ["cart_invoices.id"]),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_cart_invoice_items_cart_invoice_id", "cart_invoice_items", ["cart_invoice_id"])
    op.create_index("ix_cart_invoice_items_product_id", "cart_invoice_items", ["product_id"])


def downgrade():
    op.drop_index("ix_cart_invoice_items_product_id", table_name="cart_invoice_items")
    op.drop_index("ix_cart_invoice_items_cart_invoice_id", table_name="cart_invoice_items")
    op.drop_table("cart_invoice_items")
    op.drop_index("ix_cart_invoices_status", table_name="cart_invoices")
    op.drop_index("ix_cart_invoices_invoice_id", table_name="cart_invoices")
    op.drop_table("cart_invoices")
