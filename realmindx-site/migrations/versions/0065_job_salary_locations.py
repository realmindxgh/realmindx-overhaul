"""Add job salary display modes and reviewed Accra locations.

Revision ID: 0065_job_salary_locations
Revises: 0064_admin_manual_orders
"""

from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


revision = "0065_job_salary_locations"
down_revision = "0064_admin_manual_orders"
branch_labels = None
depends_on = None


JOB_LOCATIONS = [
    ("Abofu", ""), ("Accra Central", ""), ("Addogonno", ""), ("Adiembra", ""),
    ("Agbogba", ""), ("Agbogbloshie", "Old Fadama"), ("Airport City", ""),
    ("Airport Hills", ""), ("Airport West", ""), ("Alajo North", ""),
    ("Alogboshie", "Algoboshie"), ("Amamoley", "Amamole\nAmamorley"),
    ("Asofan", "Asofaa"), ("Atomic", ""), ("Avenor", ""),
    ("Awoshie", "Awoshi"), ("Awudome", "Awudome Estate"),
    ("Ayi Mensah", "Ayimensa"), ("Banana Inn", ""), ("Borteyman", ""),
    ("Bukom", ""), ("Chantan", ""), ("Christian Village", "Christians Village"),
    ("Domeabra", ""), ("Dzen Ayor", ""), ("Dzornaman", ""),
    ("East Airport", ""), ("East Legon Extension", ""), ("Fise", ""),
    ("Gbetsile", ""), ("Klagon", ""), ("Korle Bu", "Korle-Bu"),
    ("Korle Dudor", "Ussher Town"), ("Kwashiebu", ""), ("Labone", ""),
    ("Martey Tsuru", ""), ("Mendskrom", ""), ("Mpoase", "Mpuase"),
    ("Nanakrom", "NanaKrom Estates"), ("New Achimota", ""),
    ("New Aplaku", ""), ("New Gbawe", ""), ("New Legon", ""),
    ("New Mamprobi", ""), ("New Russia", ""),
    ("Nii Boi Town", "Niiboye Town"), ("Nmai Dzorn", "Nmai Dzorm"),
    ("North Industrial Area", ""), ("North Ridge", ""), ("Nyamekye", ""),
    ("Nyaniba Estates", ""), ("Odorkor", "North Odorkor\nSouth Odorkor"),
    ("Ogbodjo", "Ogbojo\nOgbodzo"), ("Okpoi Gonno", ""), ("Otaten", ""),
    ("Otanor", ""), ("Pig Farm", ""), ("Ridge", ""),
    ("Ringway Estates", "Ringway Estate"), ("Sabon Zongo", ""),
    ("Sakaman", ""), ("Santa Maria", ""), ("South Industrial Area", ""),
    ("South Legon", ""), ("Tabora", ""), ("Tantra Hill", ""),
    ("Teiman", ""), ("Tema New Town", "Tema Newtown"),
    ("Tetegu", "Tetegbu"), ("Trasacco Valley", "Trasacco"),
    ("Tse Addo", "Tse-Addo"), ("Tudu", ""), ("West Ridge", ""),
    ("Westland", ""),
    *[(f"Tema Community {number}", f"Community {number}") for number in [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 24, 25]],
]


def upgrade():
    op.add_column(
        "jobs",
        sa.Column("salary_display_mode", sa.String(length=24), nullable=False, server_default="on_request"),
    )
    op.execute(sa.text("""
        UPDATE jobs
        SET salary_display_mode = CASE
            WHEN salary_min IS NOT NULL OR salary_max IS NOT NULL THEN 'range'
            ELSE 'on_request'
        END
    """))
    bind = op.get_bind()
    existing = {
        str(row[0]).strip().lower()
        for row in bind.execute(sa.text("SELECT name FROM delivery_zones")).all()
    }
    now = datetime.now(timezone.utc)
    next_sort = bind.execute(sa.text("SELECT COALESCE(MAX(sort_order), 0) FROM delivery_zones")).scalar_one()
    for name, aliases in JOB_LOCATIONS:
        if name.lower() in existing:
            if aliases:
                bind.execute(
                    sa.text("UPDATE delivery_zones SET aliases = :aliases, updated_at = :now WHERE lower(name) = :name AND (aliases IS NULL OR aliases = '')"),
                    {"aliases": aliases, "now": now, "name": name.lower()},
                )
            continue
        next_sort += 1
        bind.execute(sa.text("""
            INSERT INTO delivery_zones
                (created_at, updated_at, name, fee, description, aliases, region,
                 district_or_municipality, nearby_major_town, delivery_zone_label,
                 is_delivery_area, is_search_alias_only, is_active, sort_order)
            VALUES
                (:now, :now, :name, 0, :description, :aliases, 'Greater Accra',
                 NULL, 'Accra', 'Delivery fee not configured',
                 :is_delivery_area, :is_search_alias_only, :is_active, :sort_order)
        """), {
            "now": now,
            "name": name,
            "description": "Available for job postings. Configure a delivery fee before enabling checkout delivery.",
            "aliases": aliases or None,
            "is_delivery_area": False,
            "is_search_alias_only": False,
            "is_active": True,
            "sort_order": next_sort,
        })
        existing.add(name.lower())


def downgrade():
    op.drop_column("jobs", "salary_display_mode")
