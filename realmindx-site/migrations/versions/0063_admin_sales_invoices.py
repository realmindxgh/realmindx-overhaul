"""Add admin-issued payable sales invoices.

Revision ID: 0063_admin_sales_invoices
Revises: 0062_book_request_addressed
"""

from alembic import op
import sqlalchemy as sa


revision = "0063_admin_sales_invoices"
down_revision = "0062_book_request_addressed"
branch_labels = None
depends_on = None


def upgrade():
    columns = [
        sa.Column("source", sa.String(length=30), nullable=False, server_default="cart"),
        sa.Column("customer_name", sa.String(length=160), nullable=True),
        sa.Column("customer_email", sa.String(length=255), nullable=True),
        sa.Column("customer_phone", sa.String(length=40), nullable=True),
        sa.Column("delivery_method", sa.String(length=30), nullable=True),
        sa.Column("delivery_zone_id", sa.Integer(), nullable=True),
        sa.Column("delivery_zone_name", sa.String(length=160), nullable=True),
        sa.Column("location", sa.String(length=255), nullable=True),
        sa.Column("delivery_region", sa.String(length=80), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="GHS"),
        sa.Column("payment_status", sa.String(length=30), nullable=False, server_default="not_applicable"),
        sa.Column("payment_method", sa.String(length=40), nullable=True),
        sa.Column("payment_provider", sa.String(length=40), nullable=True),
        sa.Column("payment_reference", sa.String(length=120), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("voided_by_id", sa.Integer(), nullable=True),
        sa.Column("void_reason", sa.Text(), nullable=True),
    ]
    for column in columns:
        op.add_column("cart_invoices", column)

    foreign_keys = [
        ("fk_cart_invoices_delivery_zone_id", "delivery_zones", ["delivery_zone_id"]),
        ("fk_cart_invoices_created_by_id", "users", ["created_by_id"]),
        ("fk_cart_invoices_voided_by_id", "users", ["voided_by_id"]),
    ]
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("cart_invoices") as batch:
            for name, target, local_columns in foreign_keys:
                batch.create_foreign_key(name, target, local_columns, ["id"])
    else:
        for name, target, local_columns in foreign_keys:
            op.create_foreign_key(name, "cart_invoices", target, local_columns, ["id"])

    for name, columns in [
        ("ix_cart_invoices_source", ["source"]),
        ("ix_cart_invoices_customer_email", ["customer_email"]),
        ("ix_cart_invoices_delivery_zone_id", ["delivery_zone_id"]),
        ("ix_cart_invoices_payment_status", ["payment_status"]),
        ("ix_cart_invoices_payment_reference", ["payment_reference"]),
        ("ix_cart_invoices_created_by_id", ["created_by_id"]),
        ("ix_cart_invoices_voided_by_id", ["voided_by_id"]),
    ]:
        op.create_index(name, "cart_invoices", columns)

    op.add_column("cart_invoice_items", sa.Column("description", sa.String(length=300), nullable=True))
    op.add_column("bookshop_payment_intents", sa.Column("cart_invoice_id", sa.Integer(), nullable=True))
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("bookshop_payment_intents") as batch:
            batch.create_foreign_key(
                "fk_bookshop_payment_intents_cart_invoice_id",
                "cart_invoices",
                ["cart_invoice_id"],
                ["id"],
            )
    else:
        op.create_foreign_key(
            "fk_bookshop_payment_intents_cart_invoice_id",
            "bookshop_payment_intents",
            "cart_invoices",
            ["cart_invoice_id"],
            ["id"],
        )
    op.create_index("ix_bookshop_payment_intents_cart_invoice_id", "bookshop_payment_intents", ["cart_invoice_id"])


def downgrade():
    op.drop_index("ix_bookshop_payment_intents_cart_invoice_id", table_name="bookshop_payment_intents")
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("bookshop_payment_intents") as batch:
            batch.drop_constraint("fk_bookshop_payment_intents_cart_invoice_id", type_="foreignkey")
    else:
        op.drop_constraint("fk_bookshop_payment_intents_cart_invoice_id", "bookshop_payment_intents", type_="foreignkey")
    op.drop_column("bookshop_payment_intents", "cart_invoice_id")
    op.drop_column("cart_invoice_items", "description")

    for name in [
        "ix_cart_invoices_voided_by_id",
        "ix_cart_invoices_created_by_id",
        "ix_cart_invoices_payment_reference",
        "ix_cart_invoices_payment_status",
        "ix_cart_invoices_delivery_zone_id",
        "ix_cart_invoices_customer_email",
        "ix_cart_invoices_source",
    ]:
        op.drop_index(name, table_name="cart_invoices")
    constraint_names = [
        "fk_cart_invoices_voided_by_id",
        "fk_cart_invoices_created_by_id",
        "fk_cart_invoices_delivery_zone_id",
    ]
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("cart_invoices") as batch:
            for name in constraint_names:
                batch.drop_constraint(name, type_="foreignkey")
    else:
        for name in constraint_names:
            op.drop_constraint(name, "cart_invoices", type_="foreignkey")
    for column_name in [
        "void_reason", "voided_by_id", "voided_at", "created_by_id", "expires_at", "issued_at", "paid_at",
        "payment_reference", "payment_provider", "payment_method", "payment_status", "currency", "notes",
        "delivery_region", "location", "delivery_zone_name", "delivery_zone_id", "delivery_method",
        "customer_phone", "customer_email", "customer_name", "source",
    ]:
        op.drop_column("cart_invoices", column_name)
