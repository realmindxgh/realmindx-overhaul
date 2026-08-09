"""Add central contacts and relational contact sources.

Revision ID: 0053_contact_audience
Revises: 0052_teacher_controls
"""

from alembic import op
import sqlalchemy as sa


revision = "0053_contact_audience"
down_revision = "0052_teacher_controls"
branch_labels = None
depends_on = None


def _columns(inspector, table_name):
    if not inspector.has_table(table_name):
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def _foreign_key_name(inspector, table_name, constrained_column):
    for foreign_key in inspector.get_foreign_keys(table_name):
        if constrained_column in (foreign_key.get("constrained_columns") or []):
            return foreign_key.get("name")
    return None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("contacts"):
        op.create_table(
            "contacts",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("email", sa.String(length=255), nullable=False),
            sa.Column("full_name", sa.String(length=160), nullable=True),
            sa.Column("phone", sa.String(length=40), nullable=True),
            sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.CheckConstraint("email = lower(trim(email))", name="ck_contacts_email_normalized"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("email", name="uq_contacts_email"),
        )
        for name, columns in (
            ("ix_contacts_email", ["email"]),
            ("ix_contacts_full_name", ["full_name"]),
            ("ix_contacts_phone", ["phone"]),
            ("ix_contacts_first_seen_at", ["first_seen_at"]),
            ("ix_contacts_last_activity_at", ["last_activity_at"]),
        ):
            op.create_index(name, "contacts", columns, unique=False)

    inspector = sa.inspect(bind)
    if not inspector.has_table("contact_sources"):
        op.create_table(
            "contact_sources",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("contact_id", sa.Integer(), nullable=False),
            sa.Column("source", sa.String(length=40), nullable=False),
            sa.Column("source_record_id", sa.String(length=80), nullable=True),
            sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.CheckConstraint(
                "source IN ('teacher','bookshop','newsletter','school','enquiry','client','admin_added')",
                name="ck_contact_sources_source",
            ),
            sa.ForeignKeyConstraint(["contact_id"], ["contacts.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("contact_id", "source", name="uq_contact_sources_contact_source"),
        )
        op.create_index("ix_contact_sources_contact_id", "contact_sources", ["contact_id"])
        op.create_index("ix_contact_sources_source", "contact_sources", ["source"])
        op.create_index("ix_contact_sources_source_record_id", "contact_sources", ["source_record_id"])

    inspector = sa.inspect(bind)
    subscriber_columns = _columns(inspector, "newsletter_subscribers")
    if "contact_id" not in subscriber_columns:
        with op.batch_alter_table("newsletter_subscribers") as batch_op:
            batch_op.add_column(sa.Column("contact_id", sa.Integer(), nullable=True))
            batch_op.create_foreign_key(
                "fk_newsletter_subscribers_contact_id_contacts",
                "contacts",
                ["contact_id"],
                ["id"],
                ondelete="CASCADE",
            )
            batch_op.create_index("ix_newsletter_subscribers_contact_id", ["contact_id"], unique=True)

    inspector = sa.inspect(bind)
    attempt_columns = _columns(inspector, "communication_attempts")
    additions = []
    if "contact_id" not in attempt_columns:
        additions.append(sa.Column("contact_id", sa.Integer(), nullable=True))
    if "error_message" not in attempt_columns:
        additions.append(sa.Column("error_message", sa.String(length=500), nullable=True))
    if "subject" not in attempt_columns:
        additions.append(sa.Column("subject", sa.String(length=255), nullable=True))
    if "idempotency_key" not in attempt_columns:
        additions.append(sa.Column("idempotency_key", sa.String(length=80), nullable=True))
    if additions:
        with op.batch_alter_table("communication_attempts") as batch_op:
            for column in additions:
                batch_op.add_column(column)
            if "contact_id" not in attempt_columns:
                batch_op.create_foreign_key(
                    "fk_communication_attempts_contact_id_contacts",
                    "contacts",
                    ["contact_id"],
                    ["id"],
                    ondelete="SET NULL",
                )
                batch_op.create_index("ix_communication_attempts_contact_id", ["contact_id"])
            if "idempotency_key" not in attempt_columns:
                batch_op.create_index("ix_communication_attempts_idempotency_key", ["idempotency_key"], unique=True)

    permissions = sa.table(
        "permissions",
        sa.column("id", sa.Integer),
        sa.column("key", sa.String),
        sa.column("description", sa.String),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    roles = sa.table("roles", sa.column("id", sa.Integer), sa.column("name", sa.String))
    role_permissions = sa.table(
        "role_permissions",
        sa.column("role_id", sa.Integer),
        sa.column("permission_id", sa.Integer),
    )
    now = sa.func.now()
    admin_id = bind.execute(sa.select(roles.c.id).where(roles.c.name == "admin")).scalar()
    for key in ("contacts.view", "contacts.create", "contacts.edit", "contacts.email"):
        permission_id = bind.execute(sa.select(permissions.c.id).where(permissions.c.key == key)).scalar()
        if not permission_id:
            bind.execute(permissions.insert().values(
                key=key,
                description=key.replace(".", " ").title(),
                created_at=now,
                updated_at=now,
            ))
            permission_id = bind.execute(sa.select(permissions.c.id).where(permissions.c.key == key)).scalar_one()
        if admin_id:
            exists = bind.execute(sa.select(role_permissions.c.role_id).where(
                role_permissions.c.role_id == admin_id,
                role_permissions.c.permission_id == permission_id,
            )).first()
            if not exists:
                bind.execute(role_permissions.insert().values(role_id=admin_id, permission_id=permission_id))


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    attempt_columns = _columns(inspector, "communication_attempts")
    attempt_contact_fk = _foreign_key_name(inspector, "communication_attempts", "contact_id")
    if {"contact_id", "error_message", "subject", "idempotency_key"} & attempt_columns:
        with op.batch_alter_table("communication_attempts") as batch_op:
            if "contact_id" in attempt_columns:
                batch_op.drop_index("ix_communication_attempts_contact_id")
                if attempt_contact_fk:
                    batch_op.drop_constraint(attempt_contact_fk, type_="foreignkey")
            if "idempotency_key" in attempt_columns:
                batch_op.drop_index("ix_communication_attempts_idempotency_key")
            for column in ("idempotency_key", "subject", "error_message", "contact_id"):
                if column in attempt_columns:
                    batch_op.drop_column(column)

    inspector = sa.inspect(bind)
    if "contact_id" in _columns(inspector, "newsletter_subscribers"):
        subscriber_contact_fk = _foreign_key_name(inspector, "newsletter_subscribers", "contact_id")
        with op.batch_alter_table("newsletter_subscribers") as batch_op:
            batch_op.drop_index("ix_newsletter_subscribers_contact_id")
            if subscriber_contact_fk:
                batch_op.drop_constraint(subscriber_contact_fk, type_="foreignkey")
            batch_op.drop_column("contact_id")

    inspector = sa.inspect(bind)
    if inspector.has_table("contact_sources"):
        op.drop_table("contact_sources")
    inspector = sa.inspect(bind)
    if inspector.has_table("contacts"):
        op.drop_table("contacts")
