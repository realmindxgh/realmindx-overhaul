"""newsletter_unsubscribe_tokens: add unsubscribe_token to newsletter_subscribers

Revision ID: 0014_newsletter_unsubscribe
Revises: 0013_ticket_system
Create Date: 2026-06-06
"""
import secrets

import sqlalchemy as sa
from alembic import op

revision = "0014_newsletter_unsubscribe"
down_revision = "0013_ticket_system"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("newsletter_subscribers") as batch_op:
        batch_op.add_column(sa.Column("unsubscribe_token", sa.String(64), nullable=True))
        batch_op.create_unique_constraint(
            "uq_newsletter_subscribers_unsubscribe_token", ["unsubscribe_token"]
        )
        batch_op.create_index(
            "ix_newsletter_subscribers_unsubscribe_token", ["unsubscribe_token"]
        )

    # Back-fill a unique token for every existing subscriber
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id FROM newsletter_subscribers WHERE unsubscribe_token IS NULL")
    ).fetchall()
    for row in rows:
        token = secrets.token_urlsafe(32)
        conn.execute(
            sa.text(
                "UPDATE newsletter_subscribers SET unsubscribe_token = :token WHERE id = :id"
            ),
            {"token": token, "id": row[0]},
        )


def downgrade():
    with op.batch_alter_table("newsletter_subscribers") as batch_op:
        batch_op.drop_index("ix_newsletter_subscribers_unsubscribe_token")
        batch_op.drop_constraint(
            "uq_newsletter_subscribers_unsubscribe_token", type_="unique"
        )
        batch_op.drop_column("unsubscribe_token")
