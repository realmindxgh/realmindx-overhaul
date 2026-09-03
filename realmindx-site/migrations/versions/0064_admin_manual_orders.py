"""Add admin-created manual order payment tracking.

Revision ID: 0064_admin_manual_orders
Revises: 0063_admin_sales_invoices
"""

from alembic import op
import sqlalchemy as sa


revision = "0064_admin_manual_orders"
down_revision = "0063_admin_sales_invoices"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("orders", sa.Column("source", sa.String(length=30), nullable=False, server_default="bookshop"))
    op.add_column("orders", sa.Column("created_by_id", sa.Integer(), nullable=True))
    op.add_column("orders", sa.Column("payment_option", sa.String(length=30), nullable=True))
    op.add_column("orders", sa.Column("amount_paid", sa.Numeric(12, 2), nullable=False, server_default="0"))
    op.add_column("orders", sa.Column("balance_due", sa.Numeric(12, 2), nullable=False, server_default="0"))

    op.execute(sa.text("""
        UPDATE orders
        SET amount_paid = CASE
                WHEN lower(COALESCE(payment_status, '')) = 'paid' THEN COALESCE(total_amount, 0)
                ELSE 0
            END,
            balance_due = CASE
                WHEN lower(COALESCE(payment_status, '')) = 'paid' THEN 0
                ELSE COALESCE(total_amount, 0)
            END
    """))

    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("orders") as batch:
            batch.create_foreign_key("fk_orders_created_by_id", "users", ["created_by_id"], ["id"])
    else:
        op.create_foreign_key("fk_orders_created_by_id", "orders", "users", ["created_by_id"], ["id"])

    op.create_index("ix_orders_source", "orders", ["source"])
    op.create_index("ix_orders_created_by_id", "orders", ["created_by_id"])


def downgrade():
    op.drop_index("ix_orders_created_by_id", table_name="orders")
    op.drop_index("ix_orders_source", table_name="orders")
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("orders") as batch:
            batch.drop_constraint("fk_orders_created_by_id", type_="foreignkey")
    else:
        op.drop_constraint("fk_orders_created_by_id", "orders", type_="foreignkey")
    op.drop_column("orders", "balance_due")
    op.drop_column("orders", "amount_paid")
    op.drop_column("orders", "payment_option")
    op.drop_column("orders", "created_by_id")
    op.drop_column("orders", "source")
