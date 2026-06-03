"""Add promo_codes table and seed Ghana delivery zones.

Revision ID: 0005_promo_codes_and_delivery_zones
Revises: 0004_bulk_discount
Create Date: 2026-06-02
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import table, column


revision = "0005_promo_delivery"
down_revision = "0004_bulk_discount"
branch_labels = None
depends_on = None

# Ghana delivery zones: (name, fee_ghs, description, sort_order)
GHANA_ZONES = [
    # Greater Accra
    ("Accra — Dome / Kwabenya", 10.00, "Pickup area — Dome Pillar 2 and nearby", 1),
    ("Accra — Central (Circle, Osu, Labone)", 12.00, "Central Accra locations", 2),
    ("Accra — East (Adenta, Madina, Legon)", 15.00, "East Accra suburbs", 3),
    ("Accra — North (Achimota, Abeka, Lapaz)", 15.00, "North Accra areas", 4),
    ("Accra — West (Dansoman, Mamprobi, Kaneshie)", 18.00, "West Accra areas", 5),
    ("Tema — Central", 20.00, "Tema township", 6),
    ("Tema — Community areas", 25.00, "Tema community 1–12", 7),
    ("Kasoa / Awoshie", 25.00, "Kasoa and Awoshie areas", 8),
    # Other regions
    ("Kumasi — City", 35.00, "Kumasi central and inner suburbs", 10),
    ("Kumasi — Outskirts", 45.00, "Kumasi outer areas", 11),
    ("Cape Coast", 50.00, "Cape Coast city and environs", 12),
    ("Takoradi / Sekondi", 55.00, "Western Region", 13),
    ("Ho (Volta Region)", 55.00, "Ho city and surroundings", 14),
    ("Koforidua / New Juaben", 45.00, "Eastern Region capital", 15),
    ("Tamale", 70.00, "Northern Region", 16),
    ("Bolgatanga / Upper East", 80.00, "Upper East Region", 17),
    ("Sunyani / Brong-Ahafo", 60.00, "Brong-Ahafo Region", 18),
    ("Techiman", 65.00, "Bono East Region", 19),
    ("Other — Contact Us", 0.00, "Outside listed areas — fee confirmed by staff", 99),
]


def upgrade():
    # Create promo_codes table
    op.create_table(
        "promo_codes",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("code", sa.String(40), nullable=False, unique=True, index=True),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("discount_type", sa.String(20), nullable=False, server_default="percentage"),
        sa.Column("discount_value", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("applies_to", sa.String(20), nullable=False, server_default="products"),
        sa.Column("min_order_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("max_uses", sa.Integer, nullable=True),
        sa.Column("uses_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("valid_from", sa.Date, nullable=True),
        sa.Column("valid_until", sa.Date, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # Seed delivery zones (only if none exist yet)
    dz = table("delivery_zones",
        column("name", sa.String),
        column("fee", sa.Numeric),
        column("description", sa.Text),
        column("sort_order", sa.Integer),
        column("is_active", sa.Boolean),
    )
    conn = op.get_bind()
    existing = conn.execute(sa.text("SELECT COUNT(*) FROM delivery_zones")).scalar()
    if existing == 0:
        op.bulk_insert(dz, [
            {"name": name, "fee": fee, "description": desc, "sort_order": sort, "is_active": True}
            for name, fee, desc, sort in GHANA_ZONES
        ])


def downgrade():
    op.drop_table("promo_codes")
