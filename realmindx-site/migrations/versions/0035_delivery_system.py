"""delivery_system

Revision ID: 0035_delivery_system
Revises: 0034_contacts_campaigns
Create Date: 2026-07-09
"""

from alembic import context, op
import sqlalchemy as sa


revision = "0035_delivery_system"
down_revision = "0034_contacts_campaigns"
branch_labels = None
depends_on = None


DELIVERY_PERMISSIONS = [
    "delivery.view",
    "delivery.assign",
    "delivery.companies.manage",
    "delivery.audit.view",
    "delivery.override_otp",
]


def _seed_delivery_permissions(bind):
    roles = sa.table(
        "roles",
        sa.column("id", sa.Integer),
        sa.column("name", sa.String),
        sa.column("description", sa.String),
        sa.column("created_at", sa.DateTime),
        sa.column("updated_at", sa.DateTime),
    )
    permissions = sa.table(
        "permissions",
        sa.column("id", sa.Integer),
        sa.column("key", sa.String),
        sa.column("description", sa.String),
        sa.column("created_at", sa.DateTime),
        sa.column("updated_at", sa.DateTime),
    )
    role_permissions = sa.table(
        "role_permissions",
        sa.column("role_id", sa.Integer),
        sa.column("permission_id", sa.Integer),
    )

    now = sa.func.now()
    for name, description in [
        ("delivery_company_user", "Delivery company portal user."),
        ("delivery_rider", "Delivery rider portal user."),
    ]:
        existing = bind.execute(sa.select(roles.c.id).where(roles.c.name == name)).scalar()
        if not existing:
            bind.execute(roles.insert().values(name=name, description=description, created_at=now, updated_at=now))

    admin_id = bind.execute(sa.select(roles.c.id).where(roles.c.name == "admin")).scalar()
    for key in DELIVERY_PERMISSIONS:
        permission_id = bind.execute(sa.select(permissions.c.id).where(permissions.c.key == key)).scalar()
        if not permission_id:
            bind.execute(
                permissions.insert().values(
                    key=key,
                    description=key.replace("_", " ").title(),
                    created_at=now,
                    updated_at=now,
                )
            )
            permission_id = bind.execute(sa.select(permissions.c.id).where(permissions.c.key == key)).scalar()
        if admin_id and permission_id:
            existing_link = bind.execute(
                sa.select(role_permissions.c.role_id).where(
                    role_permissions.c.role_id == admin_id,
                    role_permissions.c.permission_id == permission_id,
                )
            ).scalar()
            if not existing_link:
                bind.execute(role_permissions.insert().values(role_id=admin_id, permission_id=permission_id))


def upgrade():
    op.create_table(
        "delivery_companies",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("contact_name", sa.String(length=160), nullable=True),
        sa.Column("contact_phone", sa.String(length=40), nullable=True),
        sa.Column("contact_email", sa.String(length=255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=30), server_default="active", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index("ix_delivery_companies_name", "delivery_companies", ["name"])
    op.create_index("ix_delivery_companies_status", "delivery_companies", ["status"])
    op.create_index("ix_delivery_companies_is_active", "delivery_companies", ["is_active"])

    op.create_table(
        "delivery_company_users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("phone", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=True),
        sa.Column("is_manager", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["company_id"], ["delivery_companies.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", "user_id", name="uq_delivery_company_user"),
        sa.UniqueConstraint("phone"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("ix_delivery_company_users_company_id", "delivery_company_users", ["company_id"])
    op.create_index("ix_delivery_company_users_phone", "delivery_company_users", ["phone"])
    op.create_index("ix_delivery_company_users_user_id", "delivery_company_users", ["user_id"])
    op.create_index("ix_delivery_company_users_is_active", "delivery_company_users", ["is_active"])

    op.create_table(
        "delivery_riders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("phone", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("status", sa.String(length=30), server_default="active", nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["company_id"], ["delivery_companies.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", "user_id", name="uq_delivery_rider_user"),
        sa.UniqueConstraint("phone"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("ix_delivery_riders_company_id", "delivery_riders", ["company_id"])
    op.create_index("ix_delivery_riders_phone", "delivery_riders", ["phone"])
    op.create_index("ix_delivery_riders_user_id", "delivery_riders", ["user_id"])
    op.create_index("ix_delivery_riders_is_active", "delivery_riders", ["is_active"])
    op.create_index("ix_delivery_riders_status", "delivery_riders", ["status"])

    op.create_table(
        "order_deliveries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=True),
        sa.Column("rider_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=40), server_default="assigned_to_company", nullable=False),
        sa.Column("assigned_by_id", sa.Integer(), nullable=True),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("picked_up_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("issue_reported_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("returned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("otp_required", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("otp_blocked", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("issue_reason", sa.String(length=80), nullable=True),
        sa.Column("issue_note", sa.Text(), nullable=True),
        sa.Column("failed_reason", sa.String(length=160), nullable=True),
        sa.Column("staff_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["assigned_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["company_id"], ["delivery_companies.id"]),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"]),
        sa.ForeignKeyConstraint(["rider_id"], ["delivery_riders.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("order_id"),
    )
    op.create_index("ix_order_deliveries_order_id", "order_deliveries", ["order_id"])
    op.create_index("ix_order_deliveries_company_id", "order_deliveries", ["company_id"])
    op.create_index("ix_order_deliveries_rider_id", "order_deliveries", ["rider_id"])
    op.create_index("ix_order_deliveries_status", "order_deliveries", ["status"])
    op.create_index("ix_order_deliveries_created_at", "order_deliveries", ["created_at"])
    op.create_index("ix_order_deliveries_updated_at", "order_deliveries", ["updated_at"])

    op.create_table(
        "delivery_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("delivery_id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=60), nullable=False),
        sa.Column("actor_type", sa.String(length=30), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=True),
        sa.Column("from_status", sa.String(length=40), nullable=True),
        sa.Column("to_status", sa.String(length=40), nullable=True),
        sa.Column("reason", sa.String(length=160), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["delivery_id"], ["order_deliveries.id"]),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_delivery_events_delivery_id", "delivery_events", ["delivery_id"])
    op.create_index("ix_delivery_events_order_id", "delivery_events", ["order_id"])
    op.create_index("ix_delivery_events_event_type", "delivery_events", ["event_type"])
    op.create_index("ix_delivery_events_actor_type", "delivery_events", ["actor_type"])
    op.create_index("ix_delivery_events_actor_id", "delivery_events", ["actor_id"])
    op.create_index("ix_delivery_events_created_at", "delivery_events", ["created_at"])

    op.create_table(
        "delivery_otps",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("delivery_id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("max_attempts", sa.Integer(), server_default="5", nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resend_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("send_channel", sa.String(length=20), nullable=True),
        sa.Column("send_status", sa.String(length=30), server_default="pending", nullable=False),
        sa.Column("replaced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["delivery_id"], ["order_deliveries.id"]),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_delivery_otps_delivery_id", "delivery_otps", ["delivery_id"])
    op.create_index("ix_delivery_otps_order_id", "delivery_otps", ["order_id"])
    op.create_index("ix_delivery_otps_expires_at", "delivery_otps", ["expires_at"])
    op.create_index("ix_delivery_otps_used_at", "delivery_otps", ["used_at"])
    op.create_index("ix_delivery_otps_replaced_at", "delivery_otps", ["replaced_at"])
    op.create_index("ix_delivery_otps_send_status", "delivery_otps", ["send_status"])

    if not context.is_offline_mode():
        _seed_delivery_permissions(op.get_bind())


def downgrade():
    op.drop_index("ix_delivery_otps_send_status", table_name="delivery_otps")
    op.drop_index("ix_delivery_otps_replaced_at", table_name="delivery_otps")
    op.drop_index("ix_delivery_otps_used_at", table_name="delivery_otps")
    op.drop_index("ix_delivery_otps_expires_at", table_name="delivery_otps")
    op.drop_index("ix_delivery_otps_order_id", table_name="delivery_otps")
    op.drop_index("ix_delivery_otps_delivery_id", table_name="delivery_otps")
    op.drop_table("delivery_otps")

    op.drop_index("ix_delivery_events_created_at", table_name="delivery_events")
    op.drop_index("ix_delivery_events_actor_id", table_name="delivery_events")
    op.drop_index("ix_delivery_events_actor_type", table_name="delivery_events")
    op.drop_index("ix_delivery_events_event_type", table_name="delivery_events")
    op.drop_index("ix_delivery_events_order_id", table_name="delivery_events")
    op.drop_index("ix_delivery_events_delivery_id", table_name="delivery_events")
    op.drop_table("delivery_events")

    op.drop_index("ix_order_deliveries_updated_at", table_name="order_deliveries")
    op.drop_index("ix_order_deliveries_created_at", table_name="order_deliveries")
    op.drop_index("ix_order_deliveries_status", table_name="order_deliveries")
    op.drop_index("ix_order_deliveries_rider_id", table_name="order_deliveries")
    op.drop_index("ix_order_deliveries_company_id", table_name="order_deliveries")
    op.drop_index("ix_order_deliveries_order_id", table_name="order_deliveries")
    op.drop_table("order_deliveries")

    op.drop_index("ix_delivery_riders_status", table_name="delivery_riders")
    op.drop_index("ix_delivery_riders_is_active", table_name="delivery_riders")
    op.drop_index("ix_delivery_riders_user_id", table_name="delivery_riders")
    op.drop_index("ix_delivery_riders_phone", table_name="delivery_riders")
    op.drop_index("ix_delivery_riders_company_id", table_name="delivery_riders")
    op.drop_table("delivery_riders")

    op.drop_index("ix_delivery_company_users_is_active", table_name="delivery_company_users")
    op.drop_index("ix_delivery_company_users_user_id", table_name="delivery_company_users")
    op.drop_index("ix_delivery_company_users_phone", table_name="delivery_company_users")
    op.drop_index("ix_delivery_company_users_company_id", table_name="delivery_company_users")
    op.drop_table("delivery_company_users")

    op.drop_index("ix_delivery_companies_is_active", table_name="delivery_companies")
    op.drop_index("ix_delivery_companies_status", table_name="delivery_companies")
    op.drop_index("ix_delivery_companies_name", table_name="delivery_companies")
    op.drop_table("delivery_companies")
