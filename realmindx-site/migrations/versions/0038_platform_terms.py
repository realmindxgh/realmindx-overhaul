"""platform terms acceptance records

Revision ID: 0038_platform_terms
Revises: 0037_book_requests
"""

from alembic import op
import sqlalchemy as sa


revision = "0038_platform_terms"
down_revision = "0037_book_requests"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "platform_terms_acceptances",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("actor_type", sa.String(length=40), nullable=False),
        sa.Column("delivery_company_id", sa.Integer(), sa.ForeignKey("delivery_companies.id"), nullable=True),
        sa.Column("rider_id", sa.Integer(), sa.ForeignKey("delivery_riders.id"), nullable=True),
        sa.Column("terms_type", sa.String(length=60), nullable=False),
        sa.Column("terms_version", sa.String(length=80), nullable=False),
        sa.Column("terms_hash", sa.String(length=64), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "terms_type", "terms_version", "terms_hash", name="uq_platform_terms_acceptance"),
    )
    for column in ["user_id", "actor_type", "delivery_company_id", "rider_id", "terms_type", "terms_version", "terms_hash", "accepted_at"]:
        op.create_index(f"ix_platform_terms_acceptances_{column}", "platform_terms_acceptances", [column])


def downgrade():
    for column in ["accepted_at", "terms_hash", "terms_version", "terms_type", "rider_id", "delivery_company_id", "actor_type", "user_id"]:
        op.drop_index(f"ix_platform_terms_acceptances_{column}", table_name="platform_terms_acceptances")
    op.drop_table("platform_terms_acceptances")
