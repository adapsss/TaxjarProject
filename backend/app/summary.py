"""Tax summary (Task C4) and the CSV export for an accountant (Task C5). Owned by role C."""

import csv
import io
from collections import OrderedDict
from datetime import date
from decimal import Decimal
from typing import List

from sqlalchemy import literal_column
from sqlmodel import Session, select

from app import db, schemas
from app.engine.tax_rules import next_deadline
from app.models import CounterpartyRow, ReservationRow, TransactionRow

DISCLAIMER = "An estimate for setting money aside, not tax advice."

CSV_HEADER = [
    "date",
    "payer",
    "reference",
    "source_amount",
    "source_currency",
    "tax_rate_percent",
    "fx_rate",
    "reserved_amount",
    "tax_currency",
    "status",
]


def _reservations_oldest_first(session: Session) -> List[ReservationRow]:
    order = (ReservationRow.created_at, literal_column("rowid"))
    return list(session.exec(select(ReservationRow).order_by(*order)).all())


def build_summary(session: Session, today: date) -> schemas.TaxSummary:
    profile = db.get_profile(session)
    # Only reservations in the current tax currency add up meaningfully.
    rows = [r for r in _reservations_oldest_first(session) if r.tax_currency == profile.tax_currency]
    total_reserved = sum(r.reserved_amount for r in rows if r.status == "reserved")
    total_paid = sum(r.reserved_amount for r in rows if r.status == "paid")

    by_month: "OrderedDict[str, int]" = OrderedDict()
    for row in rows:
        if row.status in ("reserved", "paid"):
            month = db.as_utc(row.created_at).strftime("%Y-%m")
            by_month[month] = by_month.get(month, 0) + row.reserved_amount

    return schemas.TaxSummary.model_validate(
        {
            "taxCurrency": profile.tax_currency,
            "totalReserved": total_reserved,
            "totalPaid": total_paid,
            "byMonth": [{"month": m, "reserved": v} for m, v in sorted(by_month.items())],
            "estimatedDue": total_reserved,
            "nextDeadline": next_deadline(profile.country, profile.regime, today),
            "disclaimer": DISCLAIMER,
        }
    )


def major_units(amount: int) -> str:
    """27600 -> "276.00"."""
    sign = "-" if amount < 0 else ""
    amount = abs(amount)
    return f"{sign}{amount // 100}.{amount % 100:02d}"


def rate_percent(rate_bp: int) -> str:
    """2000 -> "20", 2250 -> "22.5"."""
    return format((Decimal(rate_bp) / 100).normalize(), "f")


def fx_text(rate: float) -> str:
    """0.92 -> "0.92", 1.0 -> "1"."""
    return f"{rate:.4f}".rstrip("0").rstrip(".")


def export_rows(session: Session) -> List[List[str]]:
    """Header first, then every reservation (undone and paid too), oldest first."""
    rows = [list(CSV_HEADER)]
    for reservation in _reservations_oldest_first(session):
        tx = session.get(TransactionRow, reservation.transaction_id)
        payer = session.get(CounterpartyRow, tx.counterparty_key) if tx else None
        rows.append(
            [
                db.as_utc(reservation.created_at).date().isoformat(),
                payer.name if payer else "",
                tx.reference if tx else "",
                major_units(reservation.source_amount),
                reservation.source_currency,
                rate_percent(reservation.rate_bp),
                fx_text(reservation.fx_rate),
                major_units(reservation.reserved_amount),
                reservation.tax_currency,
                reservation.status,
            ]
        )
    return rows


def export_csv(session: Session) -> str:
    buffer = io.StringIO()
    csv.writer(buffer).writerows(export_rows(session))
    return buffer.getvalue()
