"""Add bookshop invoices, affiliate promo ledger, and teacher placement records.

Revision ID: 0031_invoice_affiliate_teachers
Revises: 0030_bookshop_payment_intents
Create Date: 2026-06-29
"""

from uuid import uuid4

import sqlalchemy as sa
from alembic import op


revision = "0031_invoice_affiliate_teachers"
down_revision = "0030_bookshop_payment_intents"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("orders") as batch_op:
        batch_op.add_column(sa.Column("invoice_id", sa.String(length=40), nullable=True))
    bind = op.get_bind()
    existing_invoice_ids = {
        row[0]
        for row in bind.execute(sa.text("SELECT invoice_id FROM orders WHERE invoice_id IS NOT NULL")).fetchall()
    }
    for (order_id,) in bind.execute(sa.text("SELECT id FROM orders WHERE invoice_id IS NULL")).fetchall():
        invoice_id = f"RMX-INV-{uuid4().hex[:10].upper()}"
        while invoice_id in existing_invoice_ids:
            invoice_id = f"RMX-INV-{uuid4().hex[:10].upper()}"
        existing_invoice_ids.add(invoice_id)
        bind.execute(
            sa.text("UPDATE orders SET invoice_id = :invoice_id WHERE id = :order_id"),
            {"invoice_id": invoice_id, "order_id": order_id},
        )
    op.create_index("ix_orders_invoice_id", "orders", ["invoice_id"], unique=True)

    with op.batch_alter_table("promo_codes") as batch_op:
        batch_op.add_column(sa.Column("affiliate_name", sa.String(length=160), nullable=True))
        batch_op.add_column(sa.Column("affiliate_email", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("affiliate_phone", sa.String(length=40), nullable=True))
        batch_op.add_column(
            sa.Column(
                "affiliate_commission_percent",
                sa.Numeric(precision=5, scale=2),
                nullable=False,
                server_default="0",
            )
        )
        batch_op.add_column(
            sa.Column(
                "affiliate_notify_on_use",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            )
        )

    op.create_table(
        "promo_code_usages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("promo_code_id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("affiliate_name", sa.String(length=160), nullable=True),
        sa.Column("affiliate_email", sa.String(length=255), nullable=True),
        sa.Column("commission_percent", sa.Numeric(precision=5, scale=2), nullable=False, server_default="0"),
        sa.Column("merchandise_amount", sa.Numeric(precision=12, scale=2), nullable=False, server_default="0"),
        sa.Column("commission_amount", sa.Numeric(precision=12, scale=2), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="earned"),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("statement_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"]),
        sa.ForeignKeyConstraint(["promo_code_id"], ["promo_codes.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("order_id", "promo_code_id", name="uq_promo_usage_order_code"),
    )
    op.create_index("ix_promo_code_usages_promo_code_id", "promo_code_usages", ["promo_code_id"])
    op.create_index("ix_promo_code_usages_order_id", "promo_code_usages", ["order_id"])
    op.create_index("ix_promo_code_usages_code", "promo_code_usages", ["code"])
    op.create_index("ix_promo_code_usages_affiliate_email", "promo_code_usages", ["affiliate_email"])
    op.create_index("ix_promo_code_usages_status", "promo_code_usages", ["status"])
    op.create_index("ix_promo_code_usages_completed_at", "promo_code_usages", ["completed_at"])

    with op.batch_alter_table("user_profiles") as batch_op:
        batch_op.add_column(sa.Column("payout_method", sa.String(length=40), nullable=True))
        batch_op.add_column(sa.Column("payout_momo_network", sa.String(length=80), nullable=True))
        batch_op.add_column(sa.Column("payout_momo_number", sa.String(length=40), nullable=True))
        batch_op.add_column(sa.Column("payout_bank_name", sa.String(length=160), nullable=True))
        batch_op.add_column(sa.Column("payout_bank_account_name", sa.String(length=160), nullable=True))
        batch_op.add_column(sa.Column("payout_bank_account_number", sa.String(length=80), nullable=True))
        batch_op.add_column(sa.Column("payout_notes", sa.Text(), nullable=True))

    op.create_table(
        "teacher_placements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("application_id", sa.Integer(), nullable=False),
        sa.Column("job_id", sa.Integer(), nullable=True),
        sa.Column("school_name", sa.String(length=180), nullable=False),
        sa.Column("job_title", sa.String(length=180), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=False, server_default="accepted"),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.Date(), nullable=True),
        sa.Column("ended_at", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["application_id"], ["job_applications.id"]),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("application_id", name="uq_teacher_placement_application"),
    )
    op.create_index("ix_teacher_placements_user_id", "teacher_placements", ["user_id"])
    op.create_index("ix_teacher_placements_application_id", "teacher_placements", ["application_id"])
    op.create_index("ix_teacher_placements_job_id", "teacher_placements", ["job_id"])
    op.create_index("ix_teacher_placements_status", "teacher_placements", ["status"])

    bind.execute(
        sa.text(
            """
            INSERT INTO permissions (key, description, created_at, updated_at)
            SELECT CAST(:permission_key AS VARCHAR(80)),
                   CAST(:permission_description AS VARCHAR(255)),
                   CURRENT_TIMESTAMP,
                   CURRENT_TIMESTAMP
            WHERE NOT EXISTS (
                SELECT 1
                FROM permissions
                WHERE key = CAST(:permission_key AS VARCHAR(80))
            )
            """
        ),
        {
            "permission_key": "uploads.create",
            "permission_description": "Upload media and document files",
        },
    )
    bind.execute(
        sa.text(
            """
            INSERT INTO staff_permissions (user_id, permission_id)
            SELECT users.id, permissions.id
            FROM users
            JOIN roles ON roles.id = users.role_id
            JOIN permissions ON permissions.key = 'uploads.create'
            WHERE roles.name = 'staff'
            AND NOT EXISTS (
                SELECT 1 FROM staff_permissions
                WHERE staff_permissions.user_id = users.id
                AND staff_permissions.permission_id = permissions.id
            )
            """
        )
    )


def downgrade():
    bind = op.get_bind()
    bind.execute(
        sa.text(
            """
            DELETE FROM staff_permissions
            WHERE permission_id IN (SELECT id FROM permissions WHERE key = 'uploads.create')
            """
        )
    )
    bind.execute(sa.text("DELETE FROM permissions WHERE key = 'uploads.create'"))

    op.drop_index("ix_teacher_placements_status", table_name="teacher_placements")
    op.drop_index("ix_teacher_placements_job_id", table_name="teacher_placements")
    op.drop_index("ix_teacher_placements_application_id", table_name="teacher_placements")
    op.drop_index("ix_teacher_placements_user_id", table_name="teacher_placements")
    op.drop_table("teacher_placements")

    with op.batch_alter_table("user_profiles") as batch_op:
        batch_op.drop_column("payout_notes")
        batch_op.drop_column("payout_bank_account_number")
        batch_op.drop_column("payout_bank_account_name")
        batch_op.drop_column("payout_bank_name")
        batch_op.drop_column("payout_momo_number")
        batch_op.drop_column("payout_momo_network")
        batch_op.drop_column("payout_method")

    op.drop_index("ix_promo_code_usages_completed_at", table_name="promo_code_usages")
    op.drop_index("ix_promo_code_usages_status", table_name="promo_code_usages")
    op.drop_index("ix_promo_code_usages_affiliate_email", table_name="promo_code_usages")
    op.drop_index("ix_promo_code_usages_code", table_name="promo_code_usages")
    op.drop_index("ix_promo_code_usages_order_id", table_name="promo_code_usages")
    op.drop_index("ix_promo_code_usages_promo_code_id", table_name="promo_code_usages")
    op.drop_table("promo_code_usages")

    with op.batch_alter_table("promo_codes") as batch_op:
        batch_op.drop_column("affiliate_notify_on_use")
        batch_op.drop_column("affiliate_commission_percent")
        batch_op.drop_column("affiliate_phone")
        batch_op.drop_column("affiliate_email")
        batch_op.drop_column("affiliate_name")

    op.drop_index("ix_orders_invoice_id", table_name="orders")
    with op.batch_alter_table("orders") as batch_op:
        batch_op.drop_column("invoice_id")
