"""Database tables (SQLModel). Owned by Backend 1.

Every amount is an integer in minor units (cents). Rates are integer basis
points: 2000 means 20%. Timestamps are timezone-aware UTC: use `utcnow()`.
Recent SQLModel rejects naive datetimes; older SQLModel reads them back naive,
which `db.as_utc` fixes on the way out.

Only `reservations.py` (Backend 2) writes to the Tax Jar. Everything else reads it.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import BigInteger, CheckConstraint, Column, DateTime, Identity
from sqlmodel import Field, SQLModel

TAX_JAR_ID = "tax"
PROFILE_ID = 1


def new_id() -> str:
    return str(uuid.uuid4())


def money(default=None):
    """A BIGINT money column: amounts in minor units can exceed 32 bits."""
    if default is None:
        return Field(sa_column=Column(BigInteger, nullable=False))
    return Field(default=default, sa_column=Column(BigInteger, nullable=False, default=default))


def seq():
    """Insertion order, filled by Postgres. Lists that must keep the order rows were added in sort by it."""
    return Field(default=None, sa_column=Column(BigInteger, Identity(always=True), nullable=False))


def timestamp(index: bool = False):
    return Field(default_factory=lambda: utcnow(), sa_column=Column(DateTime(timezone=True), nullable=False, index=index))


def checks(**conditions: str) -> tuple:
    """Table CHECK constraints, name=condition. Kept equal to migration 0005 (tests/test_db.py compares)."""
    return tuple(CheckConstraint(condition, name=name) for name, condition in conditions.items())


def utcnow() -> datetime:
    """Current time, timezone-aware UTC. Use it for every timestamp you store."""
    return datetime.now(timezone.utc)


class ProfileRow(SQLModel, table=True):
    """The single tax profile, always id 1. Disabled until onboarding."""

    __table_args__ = checks(profile_rate_range="rate_bp BETWEEN 0 AND 10000")

    id: int = Field(default=PROFILE_ID, primary_key=True)
    owner_name: str
    country: str
    regime: str
    rate_bp: int
    tax_currency: str
    enabled: bool = False


class BalanceRow(SQLModel, table=True):
    __table_args__ = checks(balance_not_negative="amount >= 0")

    currency: str = Field(primary_key=True)
    amount: int = money(0)
    seq: Optional[int] = seq()


class JarRow(SQLModel, table=True):
    """A Jar. The Tax Jar has id "tax" (TAX_JAR_ID) and type "tax"."""

    __table_args__ = checks(jar_not_negative="balance >= 0", jar_type_known="type IN ('tax', 'regular')")

    id: str = Field(primary_key=True)
    name: str
    currency: str
    balance: int = money(0)
    type: str = "regular"  # "tax" | "regular"
    seq: Optional[int] = seq()


class CounterpartyRow(SQLModel, table=True):
    """A payer, keyed by classifier.normalize_name(name).

    status is what the user taught us: "client", "personal", or None (never asked).
    """

    __table_args__ = checks(
        counterparty_kind_known="kind IN ('company', 'person', 'unknown')",
        counterparty_status_known="status IS NULL OR status IN ('client', 'personal')",
    )

    key: str = Field(primary_key=True)
    name: str
    kind: str = "unknown"  # "company" | "person" | "unknown"
    status: Optional[str] = None


class TransactionRow(SQLModel, table=True):
    __table_args__ = checks(
        transaction_amount_positive="amount > 0",
        transaction_direction_known="direction IN ('in', 'out')",
        transaction_label_known="label IN ('income', 'personal', 'unknown')",
        transaction_confidence_range="confidence BETWEEN 0 AND 1",
    )

    id: str = Field(default_factory=new_id, primary_key=True)
    direction: str  # "in" | "out"
    amount: int = money()
    currency: str
    counterparty_key: str = Field(foreign_key="counterpartyrow.key", index=True)
    reference: str = ""
    created_at: datetime = timestamp(index=True)
    label: str  # "income" | "personal" | "unknown"
    confidence: float
    reasons_json: str = "[]"  # json.dumps(list[str])
    reservation_id: Optional[str] = None
    seq: Optional[int] = seq()


class ReservationRow(SQLModel, table=True):
    """Tax set aside for one transaction. At most one per transaction."""

    __table_args__ = checks(
        reservation_source_positive="source_amount > 0",
        reservation_reserved_not_negative="reserved_amount >= 0",
        reservation_rate_range="rate_bp BETWEEN 0 AND 10000",
        reservation_fx_positive="fx_rate > 0",
        reservation_status_known="status IN ('reserved', 'undone', 'paid')",
    )

    id: str = Field(default_factory=new_id, primary_key=True)
    transaction_id: str = Field(foreign_key="transactionrow.id", unique=True)
    source_amount: int = money()  # taken from the balance the payment arrived in
    source_currency: str
    rate_bp: int
    fx_rate: float  # display only; the money maths uses fx.convert
    reserved_amount: int = money()  # added to the Tax Jar, in tax_currency
    tax_currency: str
    status: str = "reserved"  # "reserved" | "undone" | "paid"
    created_at: datetime = timestamp(index=True)
    # The regime the tax was reserved under: the tax breakdown must not follow later profile changes.
    country: Optional[str] = None
    regime: Optional[str] = None
    seq: Optional[int] = seq()
