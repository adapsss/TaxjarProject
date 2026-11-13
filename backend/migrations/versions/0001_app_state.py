"""App state: profile, balances, jars, payers, transactions, reservations.

Revision ID: 0001
Revises:
"""
import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def _seq() -> sa.Column:
    return sa.Column("seq", sa.BigInteger, sa.Identity(always=True), nullable=False)


def upgrade() -> None:
    op.create_table(
        "profilerow",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("owner_name", sa.String, nullable=False),
        sa.Column("country", sa.String, nullable=False),
        sa.Column("regime", sa.String, nullable=False),
        sa.Column("rate_bp", sa.Integer, nullable=False),
        sa.Column("tax_currency", sa.String, nullable=False),
        sa.Column("enabled", sa.Boolean, nullable=False),
    )
    op.create_table(
        "balancerow",
        sa.Column("currency", sa.String, primary_key=True),
        sa.Column("amount", sa.BigInteger, nullable=False),
        _seq(),
    )
    op.create_table(
        "jarrow",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("currency", sa.String, nullable=False),
        sa.Column("balance", sa.BigInteger, nullable=False),
        sa.Column("type", sa.String, nullable=False),
        _seq(),
    )
    op.create_table(
        "counterpartyrow",
        sa.Column("key", sa.String, primary_key=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("kind", sa.String, nullable=False),
        sa.Column("status", sa.String, nullable=True),
    )
    op.create_table(
        "transactionrow",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("direction", sa.String, nullable=False),
        sa.Column("amount", sa.BigInteger, nullable=False),
        sa.Column("currency", sa.String, nullable=False),
        sa.Column("counterparty_key", sa.String, sa.ForeignKey("counterpartyrow.key"), nullable=False),
        sa.Column("reference", sa.String, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("label", sa.String, nullable=False),
        sa.Column("confidence", sa.Float, nullable=False),
        sa.Column("reasons_json", sa.String, nullable=False),
        sa.Column("reservation_id", sa.String, nullable=True),
        _seq(),
    )
    op.create_index("ix_transactionrow_counterparty_key", "transactionrow", ["counterparty_key"])
    op.create_index("ix_transactionrow_created_at", "transactionrow", ["created_at"])
    op.create_table(
        "reservationrow",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("transaction_id", sa.String, sa.ForeignKey("transactionrow.id"), nullable=False, unique=True),
        sa.Column("source_amount", sa.BigInteger, nullable=False),
        sa.Column("source_currency", sa.String, nullable=False),
        sa.Column("rate_bp", sa.Integer, nullable=False),
        sa.Column("fx_rate", sa.Float, nullable=False),
        sa.Column("reserved_amount", sa.BigInteger, nullable=False),
        sa.Column("tax_currency", sa.String, nullable=False),
        sa.Column("status", sa.String, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("country", sa.String, nullable=True),
        sa.Column("regime", sa.String, nullable=True),
        _seq(),
    )
    op.create_index("ix_reservationrow_created_at", "reservationrow", ["created_at"])


def downgrade() -> None:
    for table in ("reservationrow", "transactionrow", "counterpartyrow", "jarrow", "balancerow", "profilerow"):
        op.drop_table(table)
