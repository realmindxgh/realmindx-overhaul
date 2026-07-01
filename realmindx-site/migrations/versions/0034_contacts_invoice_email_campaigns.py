"""contacts_invoice_email_campaigns

Revision ID: 0034_contacts_invoice_email_campaigns
Revises: 0033_resource_source
Create Date: 2026-06-30
"""

from alembic import op
import sqlalchemy as sa


revision = "0034_contacts_invoice_email_campaigns"
down_revision = "0033_resource_source"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("cart_invoices") as batch_op:
        batch_op.add_column(sa.Column("emailed_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("viewed_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("converted_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("converted_order_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("reminder_3d_sent_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("reminder_10d_sent_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("recipients", sa.JSON(), nullable=False, server_default="[]"))
        batch_op.create_index("ix_cart_invoices_converted_order_id", ["converted_order_id"])
        batch_op.create_foreign_key("fk_cart_invoices_converted_order_id_orders", "orders", ["converted_order_id"], ["id"])

    with op.batch_alter_table("orders") as batch_op:
        batch_op.add_column(sa.Column("cart_invoice_id", sa.Integer(), nullable=True))
        batch_op.create_index("ix_orders_cart_invoice_id", ["cart_invoice_id"])
        batch_op.create_foreign_key("fk_orders_cart_invoice_id_cart_invoices", "cart_invoices", ["cart_invoice_id"], ["id"])

    with op.batch_alter_table("newsletter_subscribers") as batch_op:
        batch_op.add_column(sa.Column("communication_status", sa.String(length=40), nullable=False, server_default="marketing_active"))
        batch_op.add_column(sa.Column("sources", sa.JSON(), nullable=False, server_default="[]"))
        batch_op.add_column(sa.Column("tags", sa.JSON(), nullable=False, server_default="[]"))
        batch_op.add_column(sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("last_invoice_generated_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("last_invoice_used_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("last_order_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("notes", sa.Text(), nullable=True))
        batch_op.create_index("ix_newsletter_subscribers_communication_status", ["communication_status"])

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        bind.execute(sa.text("""
            UPDATE newsletter_subscribers
            SET sources = json_build_array(COALESCE(NULLIF(source, ''), 'site'))
            WHERE sources IS NULL OR json_array_length(sources) = 0
        """))
    else:
        bind.execute(sa.text("""
            UPDATE newsletter_subscribers
            SET sources = json_array(COALESCE(NULLIF(source, ''), 'site'))
            WHERE sources IS NULL OR json_array_length(sources) = 0
        """))


def downgrade():
    with op.batch_alter_table("newsletter_subscribers") as batch_op:
        batch_op.drop_index("ix_newsletter_subscribers_communication_status")
        batch_op.drop_column("notes")
        batch_op.drop_column("last_order_at")
        batch_op.drop_column("last_invoice_used_at")
        batch_op.drop_column("last_invoice_generated_at")
        batch_op.drop_column("last_login_at")
        batch_op.drop_column("tags")
        batch_op.drop_column("sources")
        batch_op.drop_column("communication_status")

    with op.batch_alter_table("orders") as batch_op:
        batch_op.drop_constraint("fk_orders_cart_invoice_id_cart_invoices", type_="foreignkey")
        batch_op.drop_index("ix_orders_cart_invoice_id")
        batch_op.drop_column("cart_invoice_id")

    with op.batch_alter_table("cart_invoices") as batch_op:
        batch_op.drop_constraint("fk_cart_invoices_converted_order_id_orders", type_="foreignkey")
        batch_op.drop_index("ix_cart_invoices_converted_order_id")
        batch_op.drop_column("recipients")
        batch_op.drop_column("reminder_10d_sent_at")
        batch_op.drop_column("reminder_3d_sent_at")
        batch_op.drop_column("converted_order_id")
        batch_op.drop_column("converted_at")
        batch_op.drop_column("viewed_at")
        batch_op.drop_column("emailed_at")
