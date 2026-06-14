"""Add order reviews and align legacy order statuses.

Revision ID: 0024_order_reviews
Revises: 0023_password_rotation
Create Date: 2026-06-14
"""

import sqlalchemy as sa
from alembic import op


revision = "0024_order_reviews"
down_revision = "0023_password_rotation"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "order_reviews",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("customer_name", sa.String(length=160), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="new"),
        sa.Column("source", sa.String(length=30), nullable=False, server_default="email"),
        sa.Column("admin_notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("order_id"),
    )
    op.create_index(op.f("ix_order_reviews_email"), "order_reviews", ["email"], unique=False)
    op.create_index(op.f("ix_order_reviews_status"), "order_reviews", ["status"], unique=False)

    op.execute("UPDATE orders SET status = 'confirmed' WHERE status IN ('received', 'processing')")
    op.execute("UPDATE orders SET status = 'shipped' WHERE status IN ('packed', 'ready', 'out_for_delivery', 'dispatched')")
    op.execute("UPDATE orders SET status = 'complete' WHERE status IN ('delivered', 'completed')")


def downgrade():
    op.drop_index(op.f("ix_order_reviews_status"), table_name="order_reviews")
    op.drop_index(op.f("ix_order_reviews_email"), table_name="order_reviews")
    op.drop_table("order_reviews")
