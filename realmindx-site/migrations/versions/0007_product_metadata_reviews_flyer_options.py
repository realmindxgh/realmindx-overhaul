"""Add product metadata, reviews, and flyer presentation controls."""

from alembic import op
import sqlalchemy as sa


revision = "0007_product_metadata_reviews"
down_revision = "0006_product_curriculum"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("products") as batch_op:
        batch_op.add_column(sa.Column("author", sa.String(length=180), nullable=True))
        batch_op.add_column(sa.Column("publisher", sa.String(length=180), nullable=True))
        batch_op.create_index("ix_products_author", ["author"])
        batch_op.create_index("ix_products_publisher", ["publisher"])

    with op.batch_alter_table("flyers") as batch_op:
        batch_op.alter_column("headline", existing_type=sa.String(length=160), nullable=True)
        batch_op.add_column(sa.Column("show_overlay", sa.Boolean(), nullable=False, server_default=sa.true()))
        batch_op.add_column(sa.Column("image_fit", sa.String(length=20), nullable=False, server_default="cover"))
        batch_op.add_column(sa.Column("image_position", sa.String(length=40), nullable=False, server_default="center"))

    op.create_table(
        "product_reviews",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("customer_name", sa.String(length=160), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"]),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_product_reviews_email", "product_reviews", ["email"])
    op.create_index("ix_product_reviews_order_id", "product_reviews", ["order_id"])
    op.create_index("ix_product_reviews_product_id", "product_reviews", ["product_id"])
    op.create_index("ix_product_reviews_status", "product_reviews", ["status"])

    with op.batch_alter_table("flyers") as batch_op:
        batch_op.alter_column("show_overlay", server_default=None)
        batch_op.alter_column("image_fit", server_default=None)
        batch_op.alter_column("image_position", server_default=None)

    with op.batch_alter_table("product_reviews") as batch_op:
        batch_op.alter_column("status", server_default=None)


def downgrade():
    op.drop_index("ix_product_reviews_status", table_name="product_reviews")
    op.drop_index("ix_product_reviews_product_id", table_name="product_reviews")
    op.drop_index("ix_product_reviews_order_id", table_name="product_reviews")
    op.drop_index("ix_product_reviews_email", table_name="product_reviews")
    op.drop_table("product_reviews")

    with op.batch_alter_table("flyers") as batch_op:
        batch_op.drop_column("image_position")
        batch_op.drop_column("image_fit")
        batch_op.drop_column("show_overlay")
        batch_op.alter_column("headline", existing_type=sa.String(length=160), nullable=False)

    with op.batch_alter_table("products") as batch_op:
        batch_op.drop_index("ix_products_publisher")
        batch_op.drop_index("ix_products_author")
        batch_op.drop_column("publisher")
        batch_op.drop_column("author")
