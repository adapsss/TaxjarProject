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

from sqlmodel import Field, SQLModel

TAX_JAR_ID = "tax"
PROFILE_ID = 1


def new_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    """Current time, timezone-aware UTC. Use it for every timestamp you store."""
    return datetime.now(timezone.utc)


class ProfileRow(SQLModel, table=True):
    """The single tax profile, always id 1. Disabled until onboarding."""

    id: int = Field(default=PROFILE_ID, primary_key=True)
    owner_name: str
    country: str
    regime: str
    rate_bp: int
    tax_currency: str
    enabled: bool = False


class BalanceRow(SQLModel, table=True):
    currency: str = Field(primary_key=True)
    amount: int = 0


class JarRow(SQLModel, table=True):
    """A Jar. The Tax Jar has id "tax" (TAX_JAR_ID) and type "tax"."""

    id: str = Field(primary_key=True)
    name: str
    currency: str
    balance: int = 0
    type: str = "regular"  # "tax" | "regular"


class CounterpartyRow(SQLModel, table=True):
    """A payer, keyed by classifier.normalize_name(name).

    status is what the user taught us: "client", "personal", or None (never asked).
    """

    key: str = Field(primary_key=True)
    name: str
    kind: str = "unknown"  # "company" | "person" | "unknown"
    status: Optional[str] = None


class TransactionRow(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    direction: str  # "in" | "out"
    amount: int
    currency: str
    counterparty_key: str = Field(foreign_key="counterpartyrow.key", index=True)
    reference: str = ""
    created_at: datetime = Field(default_factory=utcnow, index=True)
    label: str  # "income" | "personal" | "unknown"
    confidence: float
    reasons_json: str = "[]"  # json.dumps(list[str])
    reservation_id: Optional[str] = None


class ReservationRow(SQLModel, table=True):
    """Tax set aside for one transaction. At most one per transaction."""

    id: str = Field(default_factory=new_id, primary_key=True)
    transaction_id: str = Field(foreign_key="transactionrow.id", unique=True)
    source_amount: int  # taken from the balance the payment arrived in
    source_currency: str
    rate_bp: int
    fx_rate: float  # display only; the money maths uses fx.convert
    reserved_amount: int  # added to the Tax Jar, in tax_currency
    tax_currency: str
    status: str = "reserved"  # "reserved" | "undone" | "paid"
    created_at: datetime = Field(default_factory=utcnow, index=True)
    # The regime the tax was reserved under: the tax breakdown must not follow later profile changes.
    country: Optional[str] = None
    regime: Optional[str] = None
