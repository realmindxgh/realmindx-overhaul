"""education resource library metadata

Revision ID: 0039_resource_library
Revises: 0038_platform_terms
"""

from alembic import op
import sqlalchemy as sa


revision = "0039_resource_library"
down_revision = "0038_platform_terms"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("resources") as batch:
        batch.add_column(sa.Column("category", sa.String(length=80), nullable=False, server_default="Teacher Resources"))
        batch.add_column(sa.Column("level", sa.String(length=100), nullable=True))
        batch.add_column(sa.Column("subject", sa.String(length=120), nullable=True))
        batch.add_column(sa.Column("curriculum", sa.String(length=160), nullable=True))
        batch.add_column(sa.Column("publication_year", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("tags", sa.String(length=500), nullable=True))
        batch.add_column(sa.Column("audience", sa.String(length=160), nullable=True))
        batch.add_column(sa.Column("official_source_url", sa.String(length=500), nullable=True))
        batch.add_column(sa.Column("featured", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.add_column(sa.Column("last_verified_at", sa.Date(), nullable=True))
        batch.add_column(sa.Column("copyright_status", sa.String(length=60), nullable=True))
        batch.add_column(sa.Column("document_type", sa.String(length=80), nullable=True))
        batch.add_column(sa.Column("original_filename", sa.String(length=255), nullable=True))
        for column in ["category", "level", "subject", "publication_year", "featured", "copyright_status", "document_type"]:
            batch.create_index(f"ix_resources_{column}", [column])


def downgrade():
    with op.batch_alter_table("resources") as batch:
        for column in ["document_type", "copyright_status", "featured", "publication_year", "subject", "level", "category"]:
            batch.drop_index(f"ix_resources_{column}")
        for column in ["original_filename", "document_type", "copyright_status", "last_verified_at", "featured", "official_source_url", "audience", "tags", "publication_year", "curriculum", "subject", "level", "category"]:
            batch.drop_column(column)
