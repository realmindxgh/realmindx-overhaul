"""Add recipient-level newsletter delivery history.

Revision ID: 0056_newsletter_recipients
Revises: 0055_import_newsletter
"""

from alembic import op
import sqlalchemy as sa


revision = "0056_newsletter_recipients"
down_revision = "0055_import_newsletter"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "newsletter_campaign_recipients",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("campaign_id", sa.Integer(), nullable=False),
        sa.Column("contact_id", sa.Integer(), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="pending"),
        sa.Column("provider", sa.String(length=40), nullable=True),
        sa.Column("provider_message_id", sa.String(length=255), nullable=True),
        sa.Column("error_code", sa.String(length=80), nullable=True),
        sa.Column("error_message", sa.String(length=500), nullable=True),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("attempts", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("last_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["campaign_id"], ["newsletter_campaigns.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contact_id"], ["contacts.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("campaign_id", "email", name="uq_newsletter_campaign_recipient_email"),
    )
    op.create_index(
        "ix_newsletter_campaign_recipients_campaign_id",
        "newsletter_campaign_recipients",
        ["campaign_id"],
    )
    op.create_index(
        "ix_newsletter_campaign_recipients_contact_id",
        "newsletter_campaign_recipients",
        ["contact_id"],
    )
    op.create_index(
        "ix_newsletter_campaign_recipients_status",
        "newsletter_campaign_recipients",
        ["status"],
    )
    _backfill_unambiguous_campaigns()


def _backfill_unambiguous_campaigns():
    bind = op.get_bind()
    metadata = sa.MetaData()
    campaigns = sa.Table("newsletter_campaigns", metadata, autoload_with=bind)
    contacts = sa.Table("contacts", metadata, autoload_with=bind)
    recipients = sa.Table("newsletter_campaign_recipients", metadata, autoload_with=bind)

    for campaign in bind.execute(sa.select(campaigns)).mappings():
        recipient_count = int(campaign["recipient_count"] or 0)
        if recipient_count <= 0:
            continue
        successful_count = int(campaign["sent_count"] or 0) + int(campaign["mocked_count"] or 0)
        failed_count = int(campaign["failed_count"] or 0)
        if successful_count == recipient_count and failed_count == 0:
            status = "mocked" if int(campaign["mocked_count"] or 0) == recipient_count else "accepted"
        elif failed_count == recipient_count and successful_count == 0:
            status = "failed"
        else:
            # Aggregate-only mixed history cannot identify which address had which outcome.
            continue

        audience = campaign["audience"] or {}
        contact_ids = [value for value in audience.get("contact_ids", []) if str(value).isdigit()]
        contact_rows = []
        if contact_ids:
            contact_rows = bind.execute(
                sa.select(contacts.c.id, contacts.c.email).where(contacts.c.id.in_(contact_ids))
            ).mappings().all()
        by_email = {
            str(row["email"]).strip().lower(): row["id"]
            for row in contact_rows
            if row["email"]
        }
        for raw_email in audience.get("recipient_emails", []):
            email = str(raw_email or "").strip().lower()
            if email:
                by_email.setdefault(email, None)
        if len(by_email) != recipient_count:
            continue

        attempt = {
            "status": status,
            "provider": "historical",
            "provider_message_id": None,
            "error_code": None,
            "error_message": "Historical aggregate result",
            "attempted_at": campaign["sent_at"].isoformat() if campaign["sent_at"] else None,
        }
        bind.execute(
            recipients.insert(),
            [
                {
                    "campaign_id": campaign["id"],
                    "contact_id": contact_id,
                    "email": email,
                    "status": status,
                    "provider": "historical",
                    "error_message": "Historical aggregate result",
                    "attempt_count": 1,
                    "attempts": [attempt],
                    "last_attempt_at": campaign["sent_at"],
                    "created_at": campaign["created_at"],
                    "updated_at": campaign["updated_at"],
                }
                for email, contact_id in by_email.items()
            ],
        )


def downgrade():
    op.drop_index("ix_newsletter_campaign_recipients_status", table_name="newsletter_campaign_recipients")
    op.drop_index("ix_newsletter_campaign_recipients_contact_id", table_name="newsletter_campaign_recipients")
    op.drop_index("ix_newsletter_campaign_recipients_campaign_id", table_name="newsletter_campaign_recipients")
    op.drop_table("newsletter_campaign_recipients")
