"""Tax summary and accountant export, computed from plain reservation records.

The functions take any objects or dicts carrying the fields of a reservation
row (`status`, `reserved_amount`, `created_at`, ...), so they work with the
database rows directly and need no database themselves.
"""
import csv
import io
from datetime import date, datetime, timezone
from typing import Iterable, Optional

from .money import format_minor, format_rate_percent
from .breakdown import describe_rule, split_tax
from .tax_rules import get_regime, next_deadline

DISCLAIMER = "An estimate for setting money aside, not tax advice."
ACTIVE = ("reserved", "paid")
EXPORT_HEADER = [
    "date", "payer", "reference", "source_amount", "source_currency",
    "tax_rate_percent", "fx_rate", "reserved_amount", "tax_currency", "status",
]


def _get(record, name, default=None):
    if isinstance(record, dict):
        return record.get(name, default)
    return getattr(record, name, default)


def _utc(moment: datetime) -> datetime:
    """Naive UTC, so aware and naive timestamps sort and bucket together."""
    if moment.tzinfo is None:
        return moment
    return moment.astimezone(timezone.utc).replace(tzinfo=None)


def _text(value) -> str:
    """Free text for a spreadsheet: a leading =, +, - or @ would be run as a formula."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@") else text


def build_summary(reservations: Iterable, *, tax_currency: str, country: Optional[str],
                  regime: Optional[str], today: date) -> dict:
    """Totals in the shape of schemas.TaxSummary (snake_case keys).

    `total_reserved` sums status "reserved", `total_paid` sums "paid"; `by_month`
    groups both by the month they were created, oldest first; "undone" is left out.
    `breakdown` splits `total_reserved` into its taxes where the regime defines an
    exact split and is None otherwise; `breakdown_rule` describes the regime in words.
    """
    total_reserved = total_paid = 0
    months = {}
    reserved_rows = []
    for record in reservations:
        status = _get(record, "status")
        if status not in ACTIVE:
            continue
        amount = _get(record, "reserved_amount") or 0
        if status == "reserved":
            total_reserved += amount
            reserved_rows.append(record)
        else:
            total_paid += amount
        month = _utc(_get(record, "created_at")).strftime("%Y-%m")
        months[month] = months.get(month, 0) + amount
    deadline = next_deadline(country, regime, today) if country and regime else None
    record = get_regime(country, regime) if country and regime else None
    return {
        "tax_currency": tax_currency,
        "total_reserved": total_reserved,
        "total_paid": total_paid,
        "by_month": [{"month": m, "reserved": months[m]} for m in sorted(months)],
        "estimated_due": total_reserved,
        "next_deadline": deadline,
        "disclaimer": DISCLAIMER,
        "breakdown": _total_breakdown(reserved_rows, record) if record else None,
        "breakdown_rule": describe_rule(record) if record else "",
    }


def _rate(record):
    rate = _get(record, "rate_bp")
    return _get(record, "rate") if rate is None else rate


def _total_breakdown(reserved_rows: list, regime: dict) -> Optional[list]:
    """Sum of the exact per-reservation splits, or None as soon as one of them is not defined."""
    if not regime.get("components"):
        return None
    totals, order = {}, []
    for record in reserved_rows:
        parts = split_tax(_get(record, "reserved_amount") or 0, regime, _rate(record))
        if parts is None:
            return None
        for part in parts:
            if part["id"] not in totals:
                totals[part["id"]] = dict(part, amount=0)
                order.append(part["id"])
            totals[part["id"]]["amount"] += part["amount"]
    if not order:
        return [{"id": c["id"], "name": c["name"], "amount": 0} for c in regime["components"]]
    return [totals[key] for key in order]


def _fx(rate) -> str:
    return format(float(rate), ".6f").rstrip("0").rstrip(".") if rate is not None else ""


def export_rows(reservations: Iterable, regime: Optional[dict] = None) -> list:
    """Rows for the accountant export, header first, oldest first, every status included.

    Each record needs the reservation fields plus `payer` and `reference` taken
    from its transaction. With a `regime` that defines an exact split, a final
    `breakdown` column lists the parts ("income_tax=110.40; social_tax=165.60").
    """
    with_parts = bool(regime and regime.get("components"))
    rows = [list(EXPORT_HEADER) + (["breakdown"] if with_parts else [])]
    for record in sorted(reservations, key=lambda r: _utc(_get(r, "created_at"))):
        source_currency = _get(record, "source_currency")
        tax_currency = _get(record, "tax_currency")
        rate = _rate(record) or 0
        parts = split_tax(_get(record, "reserved_amount"), regime, rate) if with_parts else None
        extra = ["; ".join("%s=%s" % (p["id"], format_minor(p["amount"], tax_currency)) for p in parts or [])]
        rows.append([
            _utc(_get(record, "created_at")).date().isoformat(),
            _text(_get(record, "payer")),
            _text(_get(record, "reference")),
            format_minor(_get(record, "source_amount"), source_currency),
            source_currency,
            format_rate_percent(rate),
            _fx(_get(record, "fx_rate")),
            format_minor(_get(record, "reserved_amount"), tax_currency),
            tax_currency,
            _get(record, "status"),
        ] + (extra if with_parts else []))
    return rows


def to_csv(rows: list) -> str:
    """Serialise export rows as CSV text; fields with commas or quotes are quoted."""
    buffer = io.StringIO()
    csv.writer(buffer, lineterminator="\n").writerows(rows)
    return buffer.getvalue()
