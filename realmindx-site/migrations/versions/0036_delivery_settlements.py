"""delivery settlements and demographics

Revision ID: 0036_delivery_settlements
Revises: 0035_delivery_system
"""

from alembic import op
import sqlalchemy as sa


revision = "0036_delivery_settlements"
down_revision = "0035_delivery_system"
branch_labels = None
depends_on = None


PERMISSIONS = [
    "delivery.settlements.view", "delivery.settlements.manage",
    "delivery.settlements.export", "delivery.settlements.adjust",
    "delivery.settlements.mark_paid", "delivery.settlements.dispute_resolve",
]


def upgrade():
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("sex", sa.String(30), nullable=True))
        batch.add_column(sa.Column("age_range", sa.String(30), nullable=True))
        batch.add_column(sa.Column("profile_reminder_sent_year", sa.Integer(), nullable=True))
        batch.create_index("ix_users_sex", ["sex"])
        batch.create_index("ix_users_age_range", ["age_range"])
        batch.create_index("ix_users_profile_reminder_sent_year", ["profile_reminder_sent_year"])
    with op.batch_alter_table("jobs") as batch:
        batch.add_column(sa.Column("preferred_sex", sa.String(30), nullable=True))
        batch.add_column(sa.Column("preferred_age_range", sa.String(30), nullable=True))
        batch.create_index("ix_jobs_preferred_sex", ["preferred_sex"])
        batch.create_index("ix_jobs_preferred_age_range", ["preferred_age_range"])
    with op.batch_alter_table("orders") as batch:
        batch.add_column(sa.Column("customer_sex", sa.String(30), nullable=True))
        batch.add_column(sa.Column("customer_age_range", sa.String(30), nullable=True))
        batch.create_index("ix_orders_customer_sex", ["customer_sex"])
        batch.create_index("ix_orders_customer_age_range", ["customer_age_range"])
    with op.batch_alter_table("bookshop_payment_intents") as batch:
        batch.add_column(sa.Column("customer_sex", sa.String(30), nullable=True))
        batch.add_column(sa.Column("customer_age_range", sa.String(30), nullable=True))
        batch.create_index("ix_payment_intents_customer_sex", ["customer_sex"])
        batch.create_index("ix_payment_intents_customer_age_range", ["customer_age_range"])
    with op.batch_alter_table("delivery_companies") as batch:
        batch.add_column(sa.Column("default_delivery_payable", sa.Numeric(12, 2), nullable=True))
    with op.batch_alter_table("order_deliveries") as batch:
        batch.add_column(sa.Column("company_payable_amount", sa.Numeric(12, 2), nullable=True))
        batch.add_column(sa.Column("promotion_payer", sa.String(30), server_default="none", nullable=False))
        batch.add_column(sa.Column("promotion_amount", sa.Numeric(12, 2), server_default="0", nullable=False))

    op.create_table(
        "delivery_settlement_batches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("reference", sa.String(40), nullable=False, unique=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("delivery_companies.id"), nullable=False),
        sa.Column("settlement_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(30), server_default="unsettled", nullable=False),
        sa.Column("payment_reference", sa.String(120)), sa.Column("payment_date", sa.Date()),
        sa.Column("payment_proof_url", sa.String(500)),
        sa.Column("adjustment_amount", sa.Numeric(12, 2), server_default="0", nullable=False),
        sa.Column("adjustment_reason", sa.Text()),
        sa.Column("dispute_status", sa.String(30), server_default="none", nullable=False),
        sa.Column("dispute_notes", sa.Text()), sa.Column("resolution_notes", sa.Text()),
        sa.Column("settled_at", sa.DateTime(timezone=True)),
        sa.Column("settled_by_id", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("prepared_by_id", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("company_id", "settlement_date", name="uq_delivery_settlement_day"),
    )
    for name, columns in {
        "ix_delivery_settlement_batches_reference": ["reference"],
        "ix_delivery_settlement_batches_company_id": ["company_id"],
        "ix_delivery_settlement_batches_settlement_date": ["settlement_date"],
        "ix_delivery_settlement_batches_status": ["status"],
        "ix_delivery_settlement_batches_dispute_status": ["dispute_status"],
    }.items(): op.create_index(name, "delivery_settlement_batches", columns)

    op.create_table(
        "delivery_settlement_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("batch_id", sa.Integer(), sa.ForeignKey("delivery_settlement_batches.id"), nullable=False),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id"), nullable=False, unique=True),
        sa.Column("delivery_id", sa.Integer(), sa.ForeignKey("order_deliveries.id"), nullable=False, unique=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("delivery_companies.id"), nullable=False),
        sa.Column("rider_id", sa.Integer(), sa.ForeignKey("delivery_riders.id")),
        sa.Column("settlement_date", sa.Date(), nullable=False), sa.Column("status", sa.String(30), nullable=False),
        sa.Column("order_reference", sa.String(40), nullable=False), sa.Column("company_name", sa.String(180), nullable=False),
        sa.Column("rider_name", sa.String(160)), sa.Column("customer_name", sa.String(160), nullable=False),
        sa.Column("delivery_location", sa.String(255)), sa.Column("payment_method", sa.String(40), nullable=False),
        sa.Column("book_subtotal", sa.Numeric(12, 2), nullable=False),
        sa.Column("customer_delivery_fee", sa.Numeric(12, 2), nullable=False),
        sa.Column("company_payable", sa.Numeric(12, 2), nullable=False),
        sa.Column("promotion_amount", sa.Numeric(12, 2), nullable=False), sa.Column("promotion_payer", sa.String(30), nullable=False),
        sa.Column("amount_collected_realmindx", sa.Numeric(12, 2), nullable=False),
        sa.Column("amount_collected_company", sa.Numeric(12, 2), nullable=False),
        sa.Column("amount_due_realmindx", sa.Numeric(12, 2), nullable=False),
        sa.Column("amount_due_company", sa.Numeric(12, 2), nullable=False),
        sa.Column("net_balance", sa.Numeric(12, 2), nullable=False),
        sa.Column("adjustment_amount", sa.Numeric(12, 2), server_default="0", nullable=False),
        sa.Column("adjustment_reason", sa.Text()), sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    for column in ["batch_id", "order_id", "delivery_id", "company_id", "rider_id", "settlement_date", "status", "order_reference", "payment_method", "delivered_at", "created_at"]:
        op.create_index(f"ix_delivery_settlement_lines_{column}", "delivery_settlement_lines", [column])

    op.create_table(
        "delivery_settlement_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("batch_id", sa.Integer(), sa.ForeignKey("delivery_settlement_batches.id"), nullable=False),
        sa.Column("line_id", sa.Integer(), sa.ForeignKey("delivery_settlement_lines.id")),
        sa.Column("event_type", sa.String(80), nullable=False), sa.Column("actor_type", sa.String(30), nullable=False),
        sa.Column("actor_id", sa.Integer()), sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    for column in ["batch_id", "line_id", "event_type", "actor_type", "actor_id", "created_at"]:
        op.create_index(f"ix_delivery_settlement_events_{column}", "delivery_settlement_events", [column])

    bind = op.get_bind()
    permission = sa.table("permissions", sa.column("key", sa.String), sa.column("description", sa.String), sa.column("created_at", sa.DateTime), sa.column("updated_at", sa.DateTime))
    now = sa.func.now()
    for key in PERMISSIONS:
        values = sa.select(
            sa.literal(key), sa.literal(key.replace(".", " ").title()), now, now,
        ).where(~sa.exists(sa.select(permission.c.key).where(permission.c.key == key)))
        bind.execute(permission.insert().from_select(
            ["key", "description", "created_at", "updated_at"], values,
        ))


def downgrade():
    op.drop_table("delivery_settlement_events")
    op.drop_table("delivery_settlement_lines")
    op.drop_table("delivery_settlement_batches")
    with op.batch_alter_table("order_deliveries") as batch:
        batch.drop_column("promotion_amount"); batch.drop_column("promotion_payer"); batch.drop_column("company_payable_amount")
    with op.batch_alter_table("delivery_companies") as batch: batch.drop_column("default_delivery_payable")
    with op.batch_alter_table("bookshop_payment_intents") as batch:
        batch.drop_column("customer_age_range"); batch.drop_column("customer_sex")
    with op.batch_alter_table("orders") as batch:
        batch.drop_column("customer_age_range"); batch.drop_column("customer_sex")
    with op.batch_alter_table("jobs") as batch:
        batch.drop_column("preferred_age_range"); batch.drop_column("preferred_sex")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("profile_reminder_sent_year"); batch.drop_column("age_range"); batch.drop_column("sex")
