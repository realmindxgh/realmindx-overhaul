"""book request workflow

Revision ID: 0037_book_requests
Revises: 0036_delivery_settlements
"""

from alembic import op
import sqlalchemy as sa


revision = "0037_book_requests"
down_revision = "0036_delivery_settlements"
branch_labels = None
depends_on = None


PERMISSIONS = ["bookRequests.view", "bookRequests.manage"]


def upgrade():
    op.create_table(
        "book_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("reference", sa.String(24), nullable=False, unique=True),
        sa.Column("requested_title", sa.String(220), nullable=False),
        sa.Column("normalized_title", sa.String(220), nullable=False),
        sa.Column("search_query", sa.String(220), nullable=True),
        sa.Column("browse_context", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("author", sa.String(180), nullable=True),
        sa.Column("publisher", sa.String(180), nullable=True),
        sa.Column("level", sa.String(120), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("customer_name", sa.String(160), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(40), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="pending"),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), nullable=True),
        sa.Column("product_url", sa.String(500), nullable=True),
        sa.Column("acknowledgement_email_status", sa.String(30), nullable=True),
        sa.Column("acknowledgement_sms_status", sa.String(30), nullable=True),
        sa.Column("acknowledgement_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("available_email_status", sa.String(30), nullable=True),
        sa.Column("available_sms_status", sa.String(30), nullable=True),
        sa.Column("available_notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    for column in ["reference", "requested_title", "normalized_title", "email", "phone", "status", "product_id", "available_at", "resolved_by_id", "created_at"]:
        op.create_index(f"ix_book_requests_{column}", "book_requests", [column])

    bind = op.get_bind()
    permission = sa.table("permissions", sa.column("key", sa.String), sa.column("description", sa.String), sa.column("created_at", sa.DateTime), sa.column("updated_at", sa.DateTime))
    now = sa.func.now()
    for key in PERMISSIONS:
        values = sa.select(sa.literal(key), sa.literal(key.replace(".", " ").title()), now, now).where(
            ~sa.exists(sa.select(permission.c.key).where(permission.c.key == key))
        )
        bind.execute(permission.insert().from_select(["key", "description", "created_at", "updated_at"], values))


def downgrade():
    op.drop_table("book_requests")
