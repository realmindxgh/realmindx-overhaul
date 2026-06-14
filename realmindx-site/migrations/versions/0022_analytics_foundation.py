"""Add analytics event storage and order attribution.

Revision ID: 0022_analytics_foundation
Revises: 0021_canonical_alert_matching
Create Date: 2026-06-13
"""

import sqlalchemy as sa
from alembic import op


revision = "0022_analytics_foundation"
down_revision = "0021_canonical_alert_matching"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "analytics_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=60), nullable=False),
        sa.Column("session_key", sa.String(length=80), nullable=True),
        sa.Column("visitor_key", sa.String(length=80), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("host", sa.String(length=160), nullable=True),
        sa.Column("path", sa.String(length=255), nullable=True),
        sa.Column("full_path", sa.String(length=500), nullable=True),
        sa.Column("page_title", sa.String(length=255), nullable=True),
        sa.Column("page_type", sa.String(length=80), nullable=True),
        sa.Column("referrer", sa.String(length=500), nullable=True),
        sa.Column("referrer_host", sa.String(length=160), nullable=True),
        sa.Column("traffic_source", sa.String(length=120), nullable=True),
        sa.Column("traffic_medium", sa.String(length=120), nullable=True),
        sa.Column("campaign", sa.String(length=160), nullable=True),
        sa.Column("product_id", sa.Integer(), nullable=True),
        sa.Column("news_id", sa.Integer(), nullable=True),
        sa.Column("service_id", sa.String(length=120), nullable=True),
        sa.Column("search_term", sa.String(length=255), nullable=True),
        sa.Column("search_scope", sa.String(length=40), nullable=True),
        sa.Column("results_count", sa.Integer(), nullable=True),
        sa.Column("had_results", sa.Boolean(), nullable=True),
        sa.Column("device_type", sa.String(length=40), nullable=True),
        sa.Column("browser", sa.String(length=80), nullable=True),
        sa.Column("operating_system", sa.String(length=80), nullable=True),
        sa.Column("country", sa.String(length=80), nullable=True),
        sa.Column("region", sa.String(length=80), nullable=True),
        sa.Column("city", sa.String(length=120), nullable=True),
        sa.Column("ip_hash", sa.String(length=64), nullable=True),
        sa.Column("ip_prefix", sa.String(length=80), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=True),
        sa.Column("value_amount", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["news_id"], ["news.id"]),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_analytics_events_event_type"), "analytics_events", ["event_type"], unique=False)
    op.create_index(op.f("ix_analytics_events_session_key"), "analytics_events", ["session_key"], unique=False)
    op.create_index(op.f("ix_analytics_events_visitor_key"), "analytics_events", ["visitor_key"], unique=False)
    op.create_index(op.f("ix_analytics_events_user_id"), "analytics_events", ["user_id"], unique=False)
    op.create_index(op.f("ix_analytics_events_host"), "analytics_events", ["host"], unique=False)
    op.create_index(op.f("ix_analytics_events_path"), "analytics_events", ["path"], unique=False)
    op.create_index(op.f("ix_analytics_events_page_type"), "analytics_events", ["page_type"], unique=False)
    op.create_index(op.f("ix_analytics_events_referrer_host"), "analytics_events", ["referrer_host"], unique=False)
    op.create_index(op.f("ix_analytics_events_traffic_source"), "analytics_events", ["traffic_source"], unique=False)
    op.create_index(op.f("ix_analytics_events_traffic_medium"), "analytics_events", ["traffic_medium"], unique=False)
    op.create_index(op.f("ix_analytics_events_product_id"), "analytics_events", ["product_id"], unique=False)
    op.create_index(op.f("ix_analytics_events_news_id"), "analytics_events", ["news_id"], unique=False)
    op.create_index(op.f("ix_analytics_events_service_id"), "analytics_events", ["service_id"], unique=False)
    op.create_index(op.f("ix_analytics_events_search_term"), "analytics_events", ["search_term"], unique=False)
    op.create_index(op.f("ix_analytics_events_search_scope"), "analytics_events", ["search_scope"], unique=False)
    op.create_index(op.f("ix_analytics_events_device_type"), "analytics_events", ["device_type"], unique=False)
    op.create_index(op.f("ix_analytics_events_browser"), "analytics_events", ["browser"], unique=False)
    op.create_index(op.f("ix_analytics_events_country"), "analytics_events", ["country"], unique=False)
    op.create_index(op.f("ix_analytics_events_region"), "analytics_events", ["region"], unique=False)
    op.create_index(op.f("ix_analytics_events_city"), "analytics_events", ["city"], unique=False)
    op.create_index(op.f("ix_analytics_events_ip_hash"), "analytics_events", ["ip_hash"], unique=False)

    with op.batch_alter_table("orders") as batch_op:
        batch_op.add_column(sa.Column("analytics_session_key", sa.String(length=80), nullable=True))
        batch_op.add_column(sa.Column("analytics_visitor_key", sa.String(length=80), nullable=True))
        batch_op.create_index(op.f("ix_orders_analytics_session_key"), ["analytics_session_key"], unique=False)
        batch_op.create_index(op.f("ix_orders_analytics_visitor_key"), ["analytics_visitor_key"], unique=False)


def downgrade():
    with op.batch_alter_table("orders") as batch_op:
        batch_op.drop_index(op.f("ix_orders_analytics_visitor_key"))
        batch_op.drop_index(op.f("ix_orders_analytics_session_key"))
        batch_op.drop_column("analytics_visitor_key")
        batch_op.drop_column("analytics_session_key")

    op.drop_index(op.f("ix_analytics_events_ip_hash"), table_name="analytics_events")
    op.drop_index(op.f("ix_analytics_events_city"), table_name="analytics_events")
    op.drop_index(op.f("ix_analytics_events_region"), table_name="analytics_events")
    op.drop_index(op.f("ix_analytics_events_country"), table_name="analytics_events")
    op.drop_index(op.f("ix_analytics_events_browser"), table_name="analytics_events")
    op.drop_index(op.f("ix_analytics_events_device_type"), table_name="analytics_events")
    op.drop_index(op.f("ix_analytics_events_search_scope"), table_name="analytics_events")
    op.drop_index(op.f("ix_analytics_events_search_term"), table_name="analytics_events")
    op.drop_index(op.f("ix_analytics_events_service_id"), table_name="analytics_events")
    op.drop_index(op.f("ix_analytics_events_news_id"), table_name="analytics_events")
    op.drop_index(op.f("ix_analytics_events_product_id"), table_name="analytics_events")
    op.drop_index(op.f("ix_analytics_events_traffic_medium"), table_name="analytics_events")
    op.drop_index(op.f("ix_analytics_events_traffic_source"), table_name="analytics_events")
    op.drop_index(op.f("ix_analytics_events_referrer_host"), table_name="analytics_events")
    op.drop_index(op.f("ix_analytics_events_page_type"), table_name="analytics_events")
    op.drop_index(op.f("ix_analytics_events_path"), table_name="analytics_events")
    op.drop_index(op.f("ix_analytics_events_host"), table_name="analytics_events")
    op.drop_index(op.f("ix_analytics_events_user_id"), table_name="analytics_events")
    op.drop_index(op.f("ix_analytics_events_visitor_key"), table_name="analytics_events")
    op.drop_index(op.f("ix_analytics_events_session_key"), table_name="analytics_events")
    op.drop_index(op.f("ix_analytics_events_event_type"), table_name="analytics_events")
    op.drop_table("analytics_events")
