"""Add bookshop flyers table.

Revision ID: 0003_flyers
Revises: 0002_bookshop_payments_delivery
Create Date: 2026-05-31
"""

from alembic import op
import sqlalchemy as sa


revision = "0003_flyers"
down_revision = "0002_bookshop_payments_delivery"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("flyers"):
        # Revision 0001 builds the current metadata on a fresh database, which
        # already includes this table. Existing installations must be left
        # untouched while Alembic advances through this historical revision.
        return

    op.create_table(
        "flyers",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("headline", sa.String(160), nullable=False),
        sa.Column("accent", sa.String(160), nullable=True),
        sa.Column("subline", sa.String(300), nullable=True),
        sa.Column("badge", sa.String(60), nullable=True),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("image_file_id", sa.Integer, sa.ForeignKey("uploaded_files.id"), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="published"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table("flyers")
