"""Every write to the Tax Jar lives here: reserve, undo, pay. Owned by Backend 2 (pay_all: Backend 1, Task B6).

Each function changes a balance and the Tax Jar together, and the caller commits
once, so money never exists in both places or in neither. Events go out only
after the commit.
"""

import json
from typing import Optional, Tuple

from sqlmodel import Session, select

from app import db, fx
from app.engine.classifier import infer_kind, normalize_name
from app.engine.tax_rules import compute_tax
from app.errors import ApiError
from app.events import EventBus
from app.models import (
    TAX_JAR_ID,
    BalanceRow,
    CounterpartyRow,
    JarRow,
    ProfileRow,
    ReservationRow,
    TransactionRow,
)

TAX_AUTHORITY = "Tax authority (demo)"
TAX_PAYMENT_REFERENCE = "Tax payment"
REASON_UNDONE = "you said this wasn't income"


def get_transaction(session: Session, tx_id: str) -> TransactionRow:
    """The transaction, locked until the caller commits: two answers or undos for it run one after the other.

    Rows are always locked in the same order (transaction, balance, Tax Jar), so concurrent requests
    wait for each other instead of deadlocking.
    """
    tx = session.get(TransactionRow, tx_id, with_for_update=True, populate_existing=True)
    if tx is None:
        raise ApiError(404, "transaction_not_found", f"There is no transaction {tx_id}.")
    return tx


def _tax_jar(session: Session, tax_currency: str) -> JarRow:
    jar = session.get(JarRow, TAX_JAR_ID, with_for_update=True, populate_existing=True)
    if jar.currency != tax_currency:
        # The profile and the jar drifted apart; only an empty jar may follow the profile.
        if jar.balance != 0:
            raise ApiError(409, "tax_jar_not_empty", "The Tax Jar holds money in another currency.")
        jar.currency = tax_currency
    return jar


def reserve(session: Session, tx: TransactionRow, profile: ProfileRow) -> Optional[ReservationRow]:
    """Move tax from the balance the payment arrived in to the Tax Jar. Does not commit.

    Returns the existing reservation if there is one, None if there is nothing to reserve.
    """
    existing = session.exec(select(ReservationRow).where(ReservationRow.transaction_id == tx.id)).first()
    if existing is not None:
        return existing

    balance = session.get(BalanceRow, tx.currency, with_for_update=True, populate_existing=True)
    available = balance.amount if balance is not None else 0
    source = min(compute_tax(tx.amount, profile.rate_bp), available)
    if source <= 0:
        return None

    jar = _tax_jar(session, profile.tax_currency)
    reserved = fx.convert(source, tx.currency, profile.tax_currency)
    balance.amount -= source
    jar.balance += reserved

    reservation = ReservationRow(
        transaction_id=tx.id,
        source_amount=source,
        source_currency=tx.currency,
        rate_bp=profile.rate_bp,
        fx_rate=fx.rate(tx.currency, profile.tax_currency),
        reserved_amount=reserved,
        tax_currency=profile.tax_currency,
        status="reserved",
        country=profile.country,
        regime=profile.regime,
    )
    tx.reservation_id = reservation.id
    session.add_all([balance, jar, reservation, tx])
    return reservation


def undo(session: Session, bus: EventBus, tx_id: str) -> TransactionRow:
    """Give the reserved tax back to the source balance and mark the payment personal.

    The payer's remembered status does not change. A second undo moves nothing.
    """
    tx = get_transaction(session, tx_id)
    reservation = session.get(ReservationRow, tx.reservation_id) if tx.reservation_id else None
    if reservation is None:
        raise ApiError(409, "no_reservation", "Nothing was set aside for this payment.")
    if reservation.status == "paid":
        raise ApiError(409, "reservation_paid", "This tax has already been paid, so it can't be undone.")
    if reservation.status == "undone":
        return tx

    balance = session.get(BalanceRow, reservation.source_currency, with_for_update=True, populate_existing=True)
    if balance is None:
        balance = BalanceRow(currency=reservation.source_currency, amount=0)
    jar = session.get(JarRow, TAX_JAR_ID, with_for_update=True, populate_existing=True)
    balance.amount += reservation.source_amount
    jar.balance -= reservation.reserved_amount
    reservation.status = "undone"
    tx.label = "personal"
    tx.confidence = 0.99
    tx.reasons_json = json.dumps([REASON_UNDONE])
    session.add_all([balance, jar, reservation, tx])
    session.commit()

    bus.publish("reservation.undone", db.transaction_event(session, tx))
    return tx


def pay_all(session: Session, bus: EventBus) -> Tuple[TransactionRow, int]:
    """Pay everything reserved to the tax authority: the Tax Jar goes to 0. Returns (outgoing tx, amount)."""
    profile = db.get_profile(session)
    reserved = session.exec(select(ReservationRow).where(ReservationRow.status == "reserved")).all()
    total = sum(r.reserved_amount for r in reserved)
    if total <= 0:
        raise ApiError(409, "nothing_to_pay", "The Tax Jar is empty.")

    jar = session.get(JarRow, TAX_JAR_ID, with_for_update=True, populate_existing=True)
    for reservation in reserved:
        reservation.status = "paid"
        session.add(reservation)
    jar.balance -= total  # == 0: the jar always holds exactly the reserved total

    key = normalize_name(TAX_AUTHORITY)
    if session.get(CounterpartyRow, key) is None:
        session.add(CounterpartyRow(key=key, name=TAX_AUTHORITY, kind=infer_kind(TAX_AUTHORITY, "company")))
    payment = TransactionRow(
        direction="out",
        amount=total,
        currency=jar.currency,
        counterparty_key=key,
        reference=TAX_PAYMENT_REFERENCE,
        label="personal",
        confidence=1.0,
        reasons_json="[]",
    )
    session.add_all([jar, payment])
    session.commit()

    bus.publish("transaction.created", db.transaction_event(session, payment))
    return payment, total
