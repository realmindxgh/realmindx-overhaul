"""ticket_system: ticket_reference, assigned_to, notes on contact_messages

Revision ID: 0013_ticket_system
Revises: 0012_teacher_experience_dob
Create Date: 2026-06-06
"""
from alembic import op
import sqlalchemy as sa

revision = "0013_ticket_system"
down_revision = "0012_teacher_experience_dob"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("contact_messages") as batch_op:
        batch_op.add_column(sa.Column("ticket_reference", sa.String(20), nullable=True))
        batch_op.add_column(sa.Column("assigned_to", sa.Integer(), sa.ForeignKey("users.id"), nullable=True))
        batch_op.add_column(sa.Column("notes", sa.Text(), nullable=True))
        batch_op.create_unique_constraint("uq_contact_messages_ticket_reference", ["ticket_reference"])
        batch_op.create_index("ix_contact_messages_ticket_reference", ["ticket_reference"])

    # Back-fill ticket_reference for any existing rows that lack one
    op.execute(
        """
        UPDATE contact_messages
        SET ticket_reference = 'RMX-' || LPAD(id::text, 6, '0')
        WHERE ticket_reference IS NULL
        """
    )


def downgrade():
    with op.batch_alter_table("contact_messages") as batch_op:
        batch_op.drop_index("ix_contact_messages_ticket_reference")
        batch_op.drop_constraint("uq_contact_messages_ticket_reference", type_="unique")
        batch_op.drop_column("notes")
        batch_op.drop_column("assigned_to")
        batch_op.drop_column("ticket_reference")
