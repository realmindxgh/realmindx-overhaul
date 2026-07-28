"""Add terms_version to users and create general terms_acceptances table.

Revision ID: 0049_terms_accept
Revises: 61edc4bf3e6f
Create Date: 2026-07-27
"""

from alembic import op
import sqlalchemy as sa


revision = "0049_terms_accept"
down_revision = "61edc4bf3e6f"
branch_labels = None
depends_on = None

CURRENT_TERMS_VERSION = "v1_2026_07"


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {c["name"] for c in inspector.get_columns("users")}

    if "terms_version" not in existing_columns:
        with op.batch_alter_table("users", schema=None) as batch_op:
            batch_op.add_column(sa.Column("terms_version", sa.String(40), nullable=True))
            batch_op.add_column(sa.Column("privacy_version", sa.String(40), nullable=True))

    existing_tables = set(inspector.get_table_names())
    if "terms_acceptances" not in existing_tables:
        op.create_table(
            "terms_acceptances",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
            sa.Column("terms_type", sa.String(40), nullable=False),
            sa.Column("terms_version", sa.String(40), nullable=False),
            sa.Column("privacy_version", sa.String(40), nullable=True),
            sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("acceptance_source", sa.String(30), nullable=True),
            sa.Column("ip_address", sa.String(64), nullable=True),
            sa.Column("user_agent", sa.String(500), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_terms_acceptances_user_type_version", "terms_acceptances",
                        ["user_id", "terms_type", "terms_version"])

    v = CURRENT_TERMS_VERSION
    bind.execute(
        sa.text(
            "UPDATE users SET terms_version = :v, privacy_version = :v "
            "WHERE terms_accepted_at IS NOT NULL AND terms_version IS NULL"
        ),
        {"v": v},
    )

    existing_backfill = bind.execute(
        sa.text("SELECT COUNT(*) FROM terms_acceptances WHERE acceptance_source = 'backfill'")
    ).scalar()
    if existing_backfill == 0:
        bind.execute(
            sa.text(
                """INSERT INTO terms_acceptances
                   (user_id, terms_type, terms_version, privacy_version, accepted_at,
                    acceptance_source, created_at, updated_at)
                   SELECT id, 'platform_terms', :v, :v, terms_accepted_at,
                          'backfill', terms_accepted_at, terms_accepted_at
                   FROM users
                   WHERE terms_accepted_at IS NOT NULL"""
            ),
            {"v": v},
        )


def downgrade():
    op.drop_table("terms_acceptances")

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("privacy_version")
        batch_op.drop_column("terms_version")
