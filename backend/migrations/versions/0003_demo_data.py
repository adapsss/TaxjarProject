"""Demo data: the seed "Fresh start" restores, and the simulator's scenarios.

Revision ID: 0003
Revises: 0002
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "demo_seed",
        sa.Column("id", sa.SmallInteger, primary_key=True),
        sa.Column("data", JSONB, nullable=False),
        sa.CheckConstraint("id = 1", name="single_seed"),
        sa.CheckConstraint("jsonb_typeof(data) = 'object'", name="seed_is_an_object"),
    )
    op.create_table(
        "demo_scenario",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("position", sa.Integer, nullable=False),
        sa.Column("label", sa.String, nullable=False),
        sa.Column("sender_name", sa.String, nullable=False),
        sa.Column("sender_kind", sa.String, nullable=True),
        sa.Column("amount", sa.BigInteger, nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("reference", sa.String, nullable=False),
        sa.Column("expect", sa.String, nullable=False),
        sa.CheckConstraint("sender_kind IS NULL OR sender_kind IN ('company', 'person', 'unknown')", name="sender_kind"),
        sa.CheckConstraint("expect IN ('income', 'personal', 'unknown')", name="expect"),
        sa.CheckConstraint("amount > 0", name="amount_positive"),
    )


def downgrade() -> None:
    op.drop_table("demo_scenario")
    op.drop_table("demo_seed")
