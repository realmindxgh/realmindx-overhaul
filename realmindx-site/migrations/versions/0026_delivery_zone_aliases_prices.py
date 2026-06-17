"""Add delivery zone aliases, metadata, and checkout prices.

Revision ID: 0026_delivery_zone_aliases
Revises: 0025_flyer_focus
Create Date: 2026-06-17
"""

from datetime import datetime, timezone
import re

import sqlalchemy as sa
from alembic import op


revision = "0026_delivery_zone_aliases"
down_revision = "0025_flyer_focus"
branch_labels = None
depends_on = None


def _norm(value):
    text = str(value or "").strip().lower()
    text = re.sub(r"[\u2010-\u2015/]+", " ", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _aliases(value):
    if isinstance(value, (list, tuple, set)):
        raw_values = value
    else:
        raw_values = re.split(r"[\n,;]+", str(value or ""))
    result = []
    seen = set()
    for raw in raw_values:
        alias = str(raw or "").strip()
        key = _norm(alias)
        if alias and key and key not in seen:
            seen.add(key)
            result.append(alias)
    return result


def _join_aliases(display_name, *values):
    display_key = _norm(display_name)
    result = []
    seen = set()
    for value in values:
        for alias in _aliases(value):
            key = _norm(alias)
            if not key or key == display_key or key in seen:
                continue
            seen.add(key)
            result.append(alias)
    return "\n".join(result) or None


def _meta(
    name,
    aliases=None,
    region="Greater Accra",
    district="",
    nearby="",
    zone="",
    fee=60,
    description=None,
    delivery_area=True,
    alias_only=False,
):
    return {
        "name": name,
        "aliases": aliases or [],
        "region": region,
        "district_or_municipality": district,
        "nearby_major_town": nearby,
        "delivery_zone_label": zone,
        "fee": int(round(float(fee) / 5) * 5),
        "description": description,
        "is_delivery_area": delivery_area,
        "is_search_alias_only": alias_only,
    }


KASOA = {"region": "Central", "district": "Awutu Senya East / nearby Accra western edge", "nearby": "Kasoa", "zone": "Kasoa belt"}
NSAWAM = {"region": "Eastern", "district": "Nsawam-Adoagyiri area", "nearby": "Nsawam", "zone": "Nsawam belt"}
ABURI = {"region": "Eastern", "district": "Akuapem South / Akuapem area", "nearby": "Aburi", "zone": "Aburi belt"}
SAPEIMAN = {"region": "Greater Accra", "district": "Ga West / Pokuase / Amasaman area", "nearby": "Sapeiman", "zone": "Sapeiman / Ga West belt"}
KPONG = {"region": "Eastern", "district": "Lower Manya Krobo / Eastern corridor", "nearby": "Kpong", "zone": "Kpong corridor"}


REQUESTED_LOCATIONS = [
    _meta("Kasoa", fee=70, **KASOA),
    _meta("Odupongkpehe", aliases=["Oduponkpehe", "Odupong Kpehe", "Odupon Kpehe"], fee=70, **KASOA),
    _meta("Ofaakor", fee=70, **KASOA),
    _meta("Akweley", fee=70, **KASOA),
    _meta("Opeikuma", fee=70, **KASOA),
    _meta("Walantu", fee=70, **KASOA),
    _meta("Kpormetey", fee=70, **KASOA),
    _meta("Kasoa Zongo", aliases=["Zongo"], fee=70, **KASOA),
    _meta("Adam Nana", fee=70, **KASOA),
    _meta("Millennium City", fee=70, **KASOA),
    _meta("Galilea", fee=70, **KASOA),
    _meta("Nyanyano", fee=80, **KASOA),
    _meta("New Nyanyano", fee=80, **KASOA),
    _meta("Old Barrier", aliases=["Kasoa Old Barrier"], fee=65, **KASOA),
    _meta("CP", fee=70, **KASOA),
    _meta("Blue Top", fee=70, **KASOA),
    _meta("Iron City", fee=70, **KASOA),
    _meta("Toll Booth", fee=70, **KASOA),
    _meta("Buduburam", aliases=["Gomoa Buduburam", "Liberia Camp"], fee=75, **KASOA),
    _meta("Fetteh Kakraba", fee=80, **KASOA),
    _meta("Tuba", aliases=["Tuba Junction"], fee=60, **KASOA),
    _meta("Jei Krodua", fee=75, **KASOA),
    _meta("Ngleshie Amanfro", aliases=["Amanfrom", "Amanfro", "Kasoa Amanfrom"], fee=65, **KASOA),
    _meta("Obom Road", fee=70, **KASOA),
    _meta("Kokrobitey", aliases=["Kokrobite Junction", "Kokrobite"], fee=55, **KASOA),
    _meta("Broadcastle Road", fee=70, **KASOA),
    _meta("Kpong", fee=200, **KPONG),

    _meta("Nsawam", fee=70, **NSAWAM),
    _meta("Adoagyiri", aliases=["Nsawam Adoagyiri"], fee=70, **NSAWAM),
    _meta("Dobro", fee=60, **NSAWAM),
    _meta("Fotobi", fee=75, **NSAWAM),
    _meta("Akwakupom", fee=80, **NSAWAM),
    _meta("Pakro", fee=90, **NSAWAM),
    _meta("Asiaw-Krom", aliases=["Asiaw Krom"], fee=80, **NSAWAM),
    _meta("Nkyenekyene", fee=80, **NSAWAM),
    _meta("Ahodjo", fee=75, **NSAWAM),
    _meta("Adoagyiri Zongo", fee=70, **NSAWAM),
    _meta("Nsawam Prisons Area", fee=70, **NSAWAM),
    _meta("Nsawam Road", fee=65, **NSAWAM),
    _meta("Okobeyeyie", fee=70, **NSAWAM),
    _meta("Kyekyewere", fee=80, **NSAWAM),
    _meta("Darmang", fee=80, **NSAWAM),
    _meta("Ankwa Dobro", fee=70, **NSAWAM),
    _meta("Teacher Mante", fee=100, **NSAWAM),
    _meta("Anoff", fee=80, **NSAWAM),
    _meta("Adeiso Road", fee=90, **NSAWAM),
    _meta("Sakyikrom", fee=80, **NSAWAM),
    _meta("Ntoaso", fee=80, **NSAWAM),
    _meta("Pampamso", fee=80, **NSAWAM),
    _meta("Amanfrom Nsawam", fee=80, **NSAWAM),
    _meta("Asuboi", fee=100, **NSAWAM),
    _meta("Pokrom", fee=90, **NSAWAM),
    _meta("Adoagyiri Market Area", fee=70, **NSAWAM),

    _meta("Aburi", fee=60, **ABURI),
    _meta("Peduase", aliases=["Peduase Lodge Area"], fee=45, **ABURI),
    _meta("Kitase", aliases=["Kitasi", "Dome-Kitase", "Dome Kitase", "Dome-Kitase Road"], fee=45, **ABURI),
    _meta("Ahwerase", fee=60, **ABURI),
    _meta("Adomorobe", aliases=["Adamorobe"], fee=60, **ABURI),
    _meta("Berekuso", fee=60, **ABURI),
    _meta("Konkonuru", fee=65, **ABURI),
    _meta("Nsakye", fee=55, **ABURI),
    _meta("Attakrom", fee=60, **ABURI),
    _meta("Ayim", fee=65, **ABURI),
    _meta("Gyankama", fee=60, **ABURI),
    _meta("Obosomase", fee=70, **ABURI),
    _meta("Mampong Akuapem", fee=75, **ABURI),
    _meta("Mamfe", fee=80, **ABURI),
    _meta("Tutu", fee=80, **ABURI),
    _meta("Amanokrom", fee=90, **ABURI),
    _meta("Akropong", fee=90, **ABURI),
    _meta("Larteh", fee=100, **ABURI),
    _meta("Adukrom", fee=100, **ABURI),
    _meta("Apirede", fee=100, **ABURI),
    _meta("Abonse", fee=100, **ABURI),
    _meta("Dago", fee=80, **ABURI),
    _meta("Agyementi", fee=75, **ABURI),
    _meta("Aburi Amanfo", fee=60, **ABURI),
    _meta("Aburi Botanical Gardens Area", fee=60, **ABURI),
    _meta("Aburi Girls Area", fee=60, **ABURI),

    _meta("Sapeiman", aliases=["Sarpeiman", "Sarpiman"], fee=35, **SAPEIMAN),
    _meta("Ayikai Doblo", fee=40, **SAPEIMAN),
    _meta("Doblo", aliases=["Doblogonno"], fee=40, **SAPEIMAN),
    _meta("Kotoku", fee=40, **SAPEIMAN),
    _meta("ACP Estate", aliases=["Pokuase ACP"], fee=35, **SAPEIMAN),
    _meta("Afuaman", fee=40, **SAPEIMAN),
    _meta("Kojo Ashong", aliases=["Kwadjo Ashong"], fee=45, **SAPEIMAN),
    _meta("Oduman", fee=45, **SAPEIMAN),
    _meta("Nsakina", aliases=["Nsakyina"], fee=40, **SAPEIMAN),
    _meta("Dedeiman", fee=40, **SAPEIMAN),
    _meta("Dome Faase", fee=45, **SAPEIMAN),
    _meta("Dome Sampaman", fee=45, **SAPEIMAN),
    _meta("Katapor", fee=45, **SAPEIMAN),
    _meta("Mantsi", fee=45, **SAPEIMAN),
    _meta("Pobiman", fee=45, **SAPEIMAN),
    _meta("Torman", fee=40, **SAPEIMAN),
    _meta("Akotoshie", fee=45, **SAPEIMAN),
    _meta("Akramaman", fee=45, **SAPEIMAN),
    _meta("Ardeyman", fee=40, **SAPEIMAN),
    _meta("Adusa", aliases=["Adusa Quarters"], fee=45, **SAPEIMAN),
    _meta("Osofoman", fee=45, **SAPEIMAN),
    _meta("Okushibiade", fee=45, **SAPEIMAN),
    _meta("Nii Aboman", fee=45, **SAPEIMAN),
    _meta("Koleman", fee=45, **SAPEIMAN),
    _meta("Koteman", fee=45, **SAPEIMAN),
    _meta("Kwashiekuma", fee=45, **SAPEIMAN),
    _meta("Samsam Odumase", fee=45, **SAPEIMAN),
    _meta("Opah", fee=45, **SAPEIMAN),
]


EXPLICIT_FEES = {
    "dome pillar 2": 0,
    "madina": 20,
    "ashaiman": 60,
    "dodowa": 60,
    "prampram": 100,
    "sege": 150,
    "sege donya": 150,
    "ada foah": 150,
    "ada panya": 150,
    "big ada": 150,
    "kpong": 200,
    "kpongunor": 200,
}

for location in REQUESTED_LOCATIONS:
    EXPLICIT_FEES.setdefault(_norm(location["name"]), location["fee"])
    for location_alias in location["aliases"]:
        EXPLICIT_FEES.setdefault(_norm(location_alias), location["fee"])


FEE_RULES = [
    (0, ["dome pillar 2"]),
    (20, ["madina", "legon", "north legon", "haatso", "atomic", "kwabenya", "dome", "kisseman", "achongman"]),
    (25, ["achimota", "tesano", "dzorwulu", "airport", "roman ridge", "abelemkpe", "abelenkpe", "abeka", "lapaz", "taifa"]),
    (30, ["osu", "labadi", "cantonments", "adabraka", "kanda", "kaneshie", "circle", "north kaneshie", "kokomlemle", "nima", "mamobi", "kotobabi"]),
    (35, ["sapeiman", "sarpeiman", "pokuase", "amasaman", "ofankor", "medie", "adjen kotoku", "mayera", "kutunse", "acp estate"]),
    (40, ["adenta", "frafraha", "amrahia", "pantang", "oyarifa", "oyibi", "abokobi", "east legon", "adjiringanor", "spintex", "batsona", "lashibi", "sakumono"]),
    (45, ["peduase", "kitase", "kitasi", "weija", "west hills", "dansoman", "mallam", "mccarthy", "gbaw", "oblogo", "bortianor", "tema"]),
    (55, ["kokrobite", "kokrobitey", "tuba", "nya", "tuba junction"]),
    (60, ["ashaiman", "dodowa", "nsawam", "aburi", "afienya", "dawhenya", "shai", "katamanso", "michel camp", "kpone"]),
    (70, ["kasoa", "odupong", "odopong", "odupon", "ofaakor", "akweley", "opeikuma", "millennium", "ngleshie", "amanfro"]),
    (80, ["nyanyano", "fetteh", "buduburam", "ahwerase", "mampong", "tutu", "asuboi"]),
    (90, ["akropong", "amanokrom", "teacher mante", "pakro", "adeiso", "pokrom"]),
    (100, ["prampram", "larteh", "adukrom", "apirede", "abonse"]),
    (150, ["sege", "ada", "azizanya"]),
    (200, ["kpong", "kpongunor"]),
]


def _estimate_fee(name):
    key = _norm(name)
    if key in EXPLICIT_FEES:
        return EXPLICIT_FEES[key]
    for fee, needles in FEE_RULES:
        if any(needle in key for needle in needles):
            return fee
    return 60


def upgrade():
    op.add_column("delivery_zones", sa.Column("aliases", sa.Text(), nullable=True))
    op.add_column("delivery_zones", sa.Column("region", sa.String(length=80), nullable=True))
    op.add_column("delivery_zones", sa.Column("district_or_municipality", sa.String(length=140), nullable=True))
    op.add_column("delivery_zones", sa.Column("nearby_major_town", sa.String(length=120), nullable=True))
    op.add_column("delivery_zones", sa.Column("delivery_zone_label", sa.String(length=120), nullable=True))
    op.add_column("delivery_zones", sa.Column("is_delivery_area", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("delivery_zones", sa.Column("is_search_alias_only", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.alter_column("delivery_zones", "is_delivery_area", server_default=None)
    op.alter_column("delivery_zones", "is_search_alias_only", server_default=None)

    bind = op.get_bind()
    zones = sa.table(
        "delivery_zones",
        sa.column("id", sa.Integer()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
        sa.column("name", sa.String(length=160)),
        sa.column("fee", sa.Numeric(12, 2)),
        sa.column("description", sa.Text()),
        sa.column("aliases", sa.Text()),
        sa.column("region", sa.String(length=80)),
        sa.column("district_or_municipality", sa.String(length=140)),
        sa.column("nearby_major_town", sa.String(length=120)),
        sa.column("delivery_zone_label", sa.String(length=120)),
        sa.column("is_delivery_area", sa.Boolean()),
        sa.column("is_search_alias_only", sa.Boolean()),
        sa.column("is_active", sa.Boolean()),
        sa.column("sort_order", sa.Integer()),
    )

    def load_existing():
        rows = bind.execute(sa.select(zones)).mappings().all()
        by_key = {}
        for row in rows:
            by_key[_norm(row["name"])] = row
            for alias in _aliases(row.get("aliases")):
                by_key.setdefault(_norm(alias), row)
        return rows, by_key

    existing_rows, by_key = load_existing()
    max_sort = max([int(row["sort_order"] or 0) for row in existing_rows] or [0])
    now = datetime.now(timezone.utc)

    for index, item in enumerate(REQUESTED_LOCATIONS, start=1):
        candidates = [item["name"], *item["aliases"]]
        row = next((by_key.get(_norm(candidate)) for candidate in candidates if by_key.get(_norm(candidate))), None)
        alias_text = _join_aliases(item["name"], row["aliases"] if row else None, item["aliases"])
        description = item["description"] or f"{item['delivery_zone_label']}: estimated delivery fee from Dome Pillar 2."
        payload = {
            "fee": item["fee"],
            "description": description,
            "aliases": alias_text,
            "region": item["region"],
            "district_or_municipality": item["district_or_municipality"],
            "nearby_major_town": item["nearby_major_town"],
            "delivery_zone_label": item["delivery_zone_label"],
            "is_delivery_area": bool(item["is_delivery_area"]),
            "is_search_alias_only": bool(item["is_search_alias_only"]),
            "is_active": True,
            "updated_at": now,
        }
        if row:
            bind.execute(zones.update().where(zones.c.id == row["id"]).values(**payload))
        else:
            max_sort += 1
            insert_payload = dict(payload)
            insert_payload.pop("updated_at", None)
            bind.execute(zones.insert().values(
                created_at=now,
                updated_at=now,
                name=item["name"],
                sort_order=max_sort,
                **insert_payload,
            ))
        existing_rows, by_key = load_existing()

    for row in bind.execute(sa.select(zones)).mappings().all():
        name = row["name"]
        key = _norm(name)
        is_pickup = key == "dome pillar 2" or "pickup" in key
        fallback_region = row["region"] or "Greater Accra"
        fallback_zone = row["delivery_zone_label"] or "Greater Accra delivery area"
        fee = _estimate_fee(name)
        bind.execute(
            zones.update()
            .where(zones.c.id == row["id"])
            .values(
                fee=fee,
                region=fallback_region,
                delivery_zone_label=fallback_zone,
                is_delivery_area=False if is_pickup else bool(row["is_delivery_area"] if row["is_delivery_area"] is not None else True),
                is_search_alias_only=bool(row["is_search_alias_only"] if row["is_search_alias_only"] is not None else False),
                description=row["description"] or (
                    "Pickup point for RealMindX Bookshop orders."
                    if is_pickup
                    else f"{fallback_zone}: delivery area served from Dome Pillar 2."
                ),
                updated_at=now,
            )
        )


def downgrade():
    op.drop_column("delivery_zones", "is_search_alias_only")
    op.drop_column("delivery_zones", "is_delivery_area")
    op.drop_column("delivery_zones", "delivery_zone_label")
    op.drop_column("delivery_zones", "nearby_major_town")
    op.drop_column("delivery_zones", "district_or_municipality")
    op.drop_column("delivery_zones", "region")
    op.drop_column("delivery_zones", "aliases")
