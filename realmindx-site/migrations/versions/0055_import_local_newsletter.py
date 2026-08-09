"""Import the approved local newsletter as historical content.

Revision ID: 0055_import_newsletter
Revises: 0054_newsletter_history
"""

from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import shutil

from alembic import op
import sqlalchemy as sa


revision = "0055_import_newsletter"
down_revision = "0054_newsletter_history"
branch_labels = None
depends_on = None


CAMPAIGN_SUBJECT = "Books and School Supplies, Made Easier"
CAMPAIGN_SENT_AT = datetime(2026, 8, 9, 18, 4, 11, 269384, tzinfo=timezone.utc)
ASSETS = (
    {
        "stored_filename": "5e681c97609f4647a5d8fdfb84072464.jpg",
        "sha256": "2a83b9e32b539907e6cc914cae1ee28b25e4994a7550af05842ae53b557887bf",
        "size_bytes": 356284,
        "created_at": datetime(2026, 8, 9, 18, 0, 38, 2392, tzinfo=timezone.utc),
    },
    {
        "stored_filename": "61d7c3310f0d41d58c8146b14039d164.jpg",
        "sha256": "6203da92ccc09886b097325458f1ef698cf730dc1e20a464e4cae45dc7b3a1d3",
        "size_bytes": 113234,
        "created_at": datetime(2026, 8, 9, 18, 3, 23, 483880, tzinfo=timezone.utc),
    },
)


def _copy_verified_asset(asset):
    source = Path(__file__).resolve().parent / "assets" / "0055" / asset["stored_filename"]
    if not source.is_file():
        raise RuntimeError(f"Missing newsletter import asset: {source.name}")
    if source.stat().st_size != asset["size_bytes"]:
        raise RuntimeError(f"Newsletter import asset has unexpected size: {source.name}")
    if sha256(source.read_bytes()).hexdigest() != asset["sha256"]:
        raise RuntimeError(f"Newsletter import asset has unexpected checksum: {source.name}")

    destination = Path.cwd() / "uploads" / "public" / "images" / source.name
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        if sha256(destination.read_bytes()).hexdigest() != asset["sha256"]:
            raise RuntimeError(f"Production upload filename collision: {source.name}")
    else:
        shutil.copy2(source, destination)
    return destination


def upgrade():
    bind = op.get_bind()
    uploaded_files = sa.table(
        "uploaded_files",
        sa.column("id", sa.Integer),
        sa.column("owner_id", sa.Integer),
        sa.column("original_filename", sa.String),
        sa.column("stored_filename", sa.String),
        sa.column("storage_path", sa.String),
        sa.column("mime_type", sa.String),
        sa.column("size_bytes", sa.Integer),
        sa.column("category", sa.String),
        sa.column("visibility", sa.String),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    campaigns = sa.table(
        "newsletter_campaigns",
        sa.column("id", sa.Integer),
        sa.column("subject", sa.String),
        sa.column("title", sa.String),
        sa.column("brand", sa.String),
        sa.column("sender", sa.String),
        sa.column("content", sa.JSON),
        sa.column("audience", sa.JSON),
        sa.column("recipient_count", sa.Integer),
        sa.column("sent_count", sa.Integer),
        sa.column("mocked_count", sa.Integer),
        sa.column("failed_count", sa.Integer),
        sa.column("status", sa.String),
        sa.column("initiated_by", sa.Integer),
        sa.column("sent_at", sa.DateTime(timezone=True)),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )

    image_ids = {}
    for asset in ASSETS:
        destination = _copy_verified_asset(asset)
        existing_id = bind.execute(
            sa.select(uploaded_files.c.id).where(
                uploaded_files.c.stored_filename == asset["stored_filename"]
            )
        ).scalar_one_or_none()
        if existing_id is None:
            bind.execute(
                uploaded_files.insert().values(
                    owner_id=None,
                    original_filename="cropped.jpg",
                    stored_filename=asset["stored_filename"],
                    storage_path=str(destination),
                    mime_type="image/jpeg",
                    size_bytes=asset["size_bytes"],
                    category="images",
                    visibility="public",
                    created_at=asset["created_at"],
                    updated_at=asset["created_at"],
                )
            )
            existing_id = bind.execute(
                sa.select(uploaded_files.c.id).where(
                    uploaded_files.c.stored_filename == asset["stored_filename"]
                )
            ).scalar_one()
        image_ids[asset["stored_filename"]] = existing_id

    already_imported = bind.execute(
        sa.select(campaigns.c.id).where(
            campaigns.c.subject == CAMPAIGN_SUBJECT,
            campaigns.c.sent_at == CAMPAIGN_SENT_AT,
        )
    ).scalar_one_or_none()
    if already_imported is not None:
        return

    sections = [
        {
            "heading": "",
            "body": "<p>Good day,</p><p>We would like to briefly introduce RealMindX Bookshop, an online bookshop created to make it easier for schools, teachers and families to find and order educational materials. We stock textbooks, workbooks, exercise books, stationery and other school supplies, with more products being added as we continue to grow.</p>",
            "caption": "",
            "image_position": "full",
            "image_size": "large",
            "image_file_id": None,
            "image_url": "",
        },
        {
            "heading": "",
            "body": "<p>Schools can browse available products online, compare items and place orders without having to visit a physical shop.<br>For qualifying bulk textbook and workbook orders, we also offer a <b>10% bulk discount </b>when at least 10 copies of the same title are ordered. Even if you do not need anything at the moment, we would genuinely appreciate you taking a minute to visit the bookshop and see what we are building.</p>",
            "caption": "",
            "image_position": "full",
            "image_size": "large",
            "image_file_id": image_ids["5e681c97609f4647a5d8fdfb84072464.jpg"],
            "image_url": "/uploads/public/images/5e681c97609f4647a5d8fdfb84072464.jpg",
        },
        {
            "heading": "",
            "body": "<p>If there is a particular book or school item you need and cannot find on the website, you are also welcome to contact us. We may be able to source it for you.</p><p><br>Thank you for your time, and we hope RealMindX Bookshop can become a useful resource for your school.</p><p>Warm regards,<br>RealMindX Bookshop</p>",
            "caption": "",
            "image_position": "full",
            "image_size": "large",
            "image_file_id": image_ids["61d7c3310f0d41d58c8146b14039d164.jpg"],
            "image_url": "/uploads/public/images/61d7c3310f0d41d58c8146b14039d164.jpg",
        },
    ]
    content = {
        "subject": CAMPAIGN_SUBJECT,
        "title": "A quick introduction to RealMindX Online Bookshop",
        "brand": "bookshop",
        "sender": "bookshop",
        "preheader": "A quick hello from RealMindX Bookshop, serving schools, teachers and families.",
        "body": "",
        "sections": sections,
        "cta_label": "Visit the Bookshop",
        "cta_url": "https://bookshop.realmindxgh.com/",
        "image_file_id": None,
    }
    bind.execute(
        campaigns.insert().values(
            subject=CAMPAIGN_SUBJECT,
            title="A quick introduction to RealMindX Online Bookshop",
            brand="bookshop",
            sender="bookshop",
            content=content,
            audience={"contact_ids": [], "recipient_emails": ["skgasante@gmail.com"]},
            recipient_count=1,
            sent_count=0,
            mocked_count=1,
            failed_count=0,
            status="completed",
            initiated_by=None,
            sent_at=CAMPAIGN_SENT_AT,
            created_at=datetime(2026, 8, 9, 18, 4, 11, 272376, tzinfo=timezone.utc),
            updated_at=datetime(2026, 8, 9, 18, 4, 11, 272376, tzinfo=timezone.utc),
        )
    )


def downgrade():
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "DELETE FROM newsletter_campaigns "
            "WHERE subject = :subject AND sent_at = :sent_at AND initiated_by IS NULL"
        ),
        {"subject": CAMPAIGN_SUBJECT, "sent_at": CAMPAIGN_SENT_AT},
    )
