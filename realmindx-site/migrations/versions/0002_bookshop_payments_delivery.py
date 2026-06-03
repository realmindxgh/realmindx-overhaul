"""Add bookshop payment and delivery fields.

Revision ID: 0002_bookshop_payments_delivery
Revises: 0001_initial_schema
Create Date: 2026-05-25
"""

from alembic import op


revision = "0002_bookshop_payments_delivery"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade():
    # All DDL here is idempotent Postgres-specific syntax. On SQLite,
    # migration 0001 already created all columns/tables via metadata.create_all().
    if op.get_context().dialect.name != "postgresql":
        return

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS delivery_zones (
            id SERIAL PRIMARY KEY,
            name VARCHAR(160) UNIQUE NOT NULL,
            fee NUMERIC(12, 2) NOT NULL DEFAULT 0,
            description TEXT,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_delivery_zones_name ON delivery_zones (name)")
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(80)")
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_zone_id INTEGER")
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_zone_name VARCHAR(160)")
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(12, 2) NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) NOT NULL DEFAULT 'unpaid'")
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(40)")
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_access_code VARCHAR(120)")
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_authorization_url VARCHAR(500)")
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC(12, 2)")
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_orders_payment_reference ON orders (payment_reference)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_orders_delivery_zone_id ON orders (delivery_zone_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_orders_payment_status ON orders (payment_status)")
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_orders_delivery_zone_id'
            ) THEN
                ALTER TABLE orders
                ADD CONSTRAINT fk_orders_delivery_zone_id
                FOREIGN KEY (delivery_zone_id) REFERENCES delivery_zones(id);
            END IF;
        END $$;
        """
    )


def downgrade():
    if op.get_context().dialect.name != "postgresql":
        return
    op.execute("ALTER TABLE orders DROP CONSTRAINT IF EXISTS fk_orders_delivery_zone_id")
    op.execute("DROP INDEX IF EXISTS ix_orders_payment_status")
    op.execute("DROP INDEX IF EXISTS ix_orders_delivery_zone_id")
    op.execute("DROP INDEX IF EXISTS ix_orders_payment_reference")
    for column in [
        "paid_at",
        "subtotal_amount",
        "payment_authorization_url",
        "payment_access_code",
        "payment_provider",
        "payment_status",
        "delivery_fee",
        "delivery_zone_name",
        "delivery_zone_id",
        "payment_reference",
    ]:
        op.execute(f"ALTER TABLE orders DROP COLUMN IF EXISTS {column}")
    op.execute("DROP TABLE IF EXISTS delivery_zones")
