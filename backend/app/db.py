"""Engine, session dependency, seed loading and row -> API schema conversion. Owned by Backend 1.

Route handlers get a session with `Depends(get_session)` and turn rows into
contract shapes with `to_transaction` and `to_account`, so the JSON the
frontend sees is built in one place.
"""

import json
from datetime import datetime, timezone
from typing import Iterator, Optional

from sqlalchemy import Engine, text
from sqlmodel import Session, create_engine, delete, select

from app import schemas, settings
from app.engine.breakdown import split_tax
from app.engine.classifier import infer_kind, normalize_name
from app.engine.tax_rules import get_regime
from app.models import (
    PROFILE_ID,
    BalanceRow,
    CounterpartyRow,
    JarRow,
    ProfileRow,
    ReservationRow,
    TransactionRow,
)


# Children before parents, so a reset never leaves a dangling reference.
_TABLES_IN_DELETE_ORDER = (ReservationRow, TransactionRow, CounterpartyRow, JarRow, BalanceRow, ProfileRow)

_engine: Optional[Engine] = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        # pool_pre_ping: a connection dropped by the database (restart, idle timeout) is replaced, not served.
        _engine = create_engine(settings.database_url(), pool_pre_ping=True)
    return _engine


def init_db(engine: Optional[Engine] = None) -> None:
    """Load the seed if there is no profile yet. Called on startup. The schema comes from Alembic only."""
    engine = engine or get_engine()
    with Session(engine) as session:
        seed_if_empty(session)


def seed_if_empty(session: Session) -> bool:
    """Load the seed into an empty database; a restart must not wipe the demo state. True if it seeded."""
    if session.get(ProfileRow, PROFILE_ID) is not None:
        return False
    reset_to_seed(session)
    return True


def get_session() -> Iterator[Session]:
    """FastAPI dependency: one session per request."""
    with Session(get_engine()) as session:
        yield session


def load_seed(session: Session) -> dict:
    """The demo seed "Fresh start" restores, as stored in the database (imported from demo/seed.json)."""
    row = session.execute(text("SELECT data FROM demo_seed WHERE id = 1")).first()
    if row is None:
        raise RuntimeError("Demo seed is missing: run python -m app.data_load")
    return row[0]


def reset_to_seed(session: Session) -> None:
    """Delete every row and reload the demo seed stored in the database. Commits."""
    seed = load_seed(session)

    for table in _TABLES_IN_DELETE_ORDER:
        session.exec(delete(table))
    session.flush()
    # Objects the caller already loaded (e.g. the profile) would clash with the
    # fresh rows that reuse their primary keys.
    session.expunge_all()

    profile = seed["profile"]
    session.add(
        ProfileRow(
            id=PROFILE_ID,
            owner_name=seed["owner"],
            country=profile["country"],
            regime=profile["regime"],
            rate_bp=profile["rate"],
            tax_currency=profile["taxCurrency"],
            enabled=profile["enabled"],
        )
    )
    for balance in seed["balances"]:
        session.add(BalanceRow(currency=balance["currency"], amount=balance["amount"]))
    for jar in seed["jars"]:
        session.add(
            JarRow(id=jar["id"], name=jar["name"], currency=jar["currency"], balance=jar["balance"], type=jar["type"])
        )

    # Seed balances are absolute: past transactions are history and do not move money again.
    known_keys = set()
    for tx in seed["transactions"]:
        sender_name = tx["senderName"].strip()
        key = normalize_name(sender_name)
        if key not in known_keys:
            known_keys.add(key)
            session.add(CounterpartyRow(key=key, name=sender_name, kind=infer_kind(sender_name, tx.get("senderKind"))))
        session.add(
            TransactionRow(
                direction=tx["direction"],
                amount=tx["amount"],
                currency=tx["currency"],
                counterparty_key=key,
                reference=tx.get("reference", ""),
                created_at=parse_timestamp(tx["createdAt"]),
                label=tx["label"],
                confidence=tx.get("confidence", 1.0),
                reasons_json=json.dumps(tx.get("reasons", [])),
            )
        )
    session.commit()


def parse_timestamp(value: str) -> datetime:
    """ISO 8601 string -> aware UTC. A string without an offset is taken as UTC.

    Handles a trailing "Z" by hand: datetime.fromisoformat only accepts it from Python 3.11.
    """
    if value.endswith(("Z", "z")):
        value = value[:-1] + "+00:00"
    return as_utc(datetime.fromisoformat(value))


def as_utc(value: datetime) -> datetime:
    """Any datetime -> aware UTC; naive means UTC. The JSON then always carries an offset."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


# Schemas are built from camelCase dicts: validating by alias works whatever
# populate_by_name setting the frozen schemas use.


def to_reservation(row: ReservationRow) -> schemas.TaxReservation:
    # The split comes from the regime the reservation was made under, not from the current profile.
    regime = get_regime(row.country, row.regime) if row.country and row.regime else None
    breakdown = split_tax(row.reserved_amount, regime, row.rate_bp) if regime else None
    return schemas.TaxReservation.model_validate(
        {
            "id": row.id,
            "transactionId": row.transaction_id,
            "sourceAmount": row.source_amount,
            "sourceCurrency": row.source_currency,
            "rate": row.rate_bp,
            "fxRate": row.fx_rate,
            "reservedAmount": row.reserved_amount,
            "taxCurrency": row.tax_currency,
            "status": row.status,
            "breakdown": breakdown,
        }
    )


def to_transaction(session: Session, row: TransactionRow) -> schemas.Transaction:
    counterparty = session.get(CounterpartyRow, row.counterparty_key)
    if counterparty is None:
        raise LookupError(f"transaction {row.id} points at missing counterparty {row.counterparty_key!r}")
    reservation = session.get(ReservationRow, row.reservation_id) if row.reservation_id else None
    return schemas.Transaction.model_validate(
        {
            "id": row.id,
            "direction": row.direction,
            "amount": row.amount,
            "currency": row.currency,
            "counterparty": {
                "name": counterparty.name,
                "kind": counterparty.kind,
                "isKnownClient": counterparty.status == "client",
            },
            "reference": row.reference,
            "createdAt": as_utc(row.created_at),
            "classification": {
                "label": row.label,
                "confidence": row.confidence,
                "reasons": json.loads(row.reasons_json),
            },
            "reservationId": row.reservation_id,
            "reservation": to_reservation(reservation) if reservation else None,
        }
    )


def transaction_event(session: Session, row: TransactionRow) -> dict:
    """Event data for transaction.created, reservation.created, question.asked, reservation.undone."""
    return {"transaction": to_transaction(session, row).model_dump(mode="json", by_alias=True)}


def get_profile(session: Session) -> ProfileRow:
    profile = session.get(ProfileRow, PROFILE_ID)
    if profile is None:
        raise LookupError("no profile row: the database was never seeded")
    return profile


def to_profile(row: ProfileRow) -> schemas.TaxProfile:
    return schemas.TaxProfile.model_validate(
        {
            "country": row.country,
            "regime": row.regime,
            "rate": row.rate_bp,
            "taxCurrency": row.tax_currency,
            "enabled": row.enabled,
        }
    )


def to_account(session: Session) -> schemas.Account:
    profile = get_profile(session)
    balances = session.exec(select(BalanceRow).order_by(BalanceRow.seq)).all()
    jars = session.exec(select(JarRow).order_by(JarRow.seq)).all()
    return schemas.Account.model_validate(
        {
            "owner": profile.owner_name,
            "balances": [{"currency": b.currency, "amount": b.amount} for b in balances],
            "jars": [
                {"id": j.id, "name": j.name, "currency": j.currency, "balance": j.balance, "type": j.type}
                for j in jars
            ],
        }
    )
