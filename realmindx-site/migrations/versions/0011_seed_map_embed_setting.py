"""Seed contact_map_embed setting.

Revision ID: 0011_seed_map_embed_setting
Revises: 0010_seed_contact_settings
Create Date: 2026-06-06

The Google Maps embed URL for the Contact page iframe was previously
hardcoded directly in ContactPage.jsx JSX, making it invisible to the
admin panel and impossible to change without a code deployment.

This migration seeds it as a site_setting so it appears in Contact &
Site Details in the admin console and can be updated without code changes.
"""

import json
import sqlalchemy as sa
from alembic import op


revision = "0011_seed_map_embed_setting"
down_revision = "0010_seed_contact_settings"
branch_labels = None
depends_on = None

MAP_EMBED_URL = (
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3970.4149449183387"
    "!2d-0.21959702603021514!3d5.652959532669197!2m3!1f0!2f0!3f0!3m2!1i1024"
    "!2i768!4f13.1!3m3!1m2!1s0xfdf9d0d971fa545%3A0xb6793ef61afc720f!2sDome"
    "%20pillar%202!5e0!3m2!1sen!2sgh!4v1780224663665!5m2!1sen!2sgh"
)


def upgrade():
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "INSERT INTO site_settings (key, value, public, created_at, updated_at) "
            "VALUES (:key, CAST(:value AS json), TRUE, NOW(), NOW()) "
            "ON CONFLICT (key) DO NOTHING"
        ),
        {"key": "contact_map_embed", "value": json.dumps(MAP_EMBED_URL)},
    )


def downgrade():
    conn = op.get_bind()
    conn.execute(
        sa.text("DELETE FROM site_settings WHERE key = :key"),
        {"key": "contact_map_embed"},
    )
