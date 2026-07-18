"""Add optimized product image variant fields.

Revision ID: 0043_product_image_variants
Revises: 0042_auth_whatsapp_diag
"""

from alembic import op
import sqlalchemy as sa


revision = "0043_product_image_variants"
down_revision = "0042_auth_whatsapp_diag"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("products") as batch:
        batch.add_column(sa.Column("image_original_file_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("image_medium_file_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("image_thumb_file_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_products_image_original_file_id",
            "uploaded_files",
            ["image_original_file_id"],
            ["id"],
        )
        batch.create_foreign_key(
            "fk_products_image_medium_file_id",
            "uploaded_files",
            ["image_medium_file_id"],
            ["id"],
        )
        batch.create_foreign_key(
            "fk_products_image_thumb_file_id",
            "uploaded_files",
            ["image_thumb_file_id"],
            ["id"],
        )


def downgrade():
    with op.batch_alter_table("products") as batch:
        batch.drop_constraint("fk_products_image_thumb_file_id", type_="foreignkey")
        batch.drop_constraint("fk_products_image_medium_file_id", type_="foreignkey")
        batch.drop_constraint("fk_products_image_original_file_id", type_="foreignkey")
        batch.drop_column("image_thumb_file_id")
        batch.drop_column("image_medium_file_id")
        batch.drop_column("image_original_file_id")
