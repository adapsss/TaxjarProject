"""Every write to the Tax Jar lives here: reserve, undo, pay. Owned by Backend 2 (pay_all: Backend 1, Task B6).

Each function changes a balance and the Tax Jar together, and the caller commits
once, so money never exists in both places or in neither. Events go out only
after the commit.
"""

import json
from datetime import datetime
from typing import List, Optional, Tuple

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
    db.lock_account(session)
    tx = get_transaction(session, tx_id)
    reservation = (
        session.get(ReservationRow, tx.reservation_id, populate_existing=True) if tx.reservation_id else None
    )
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
    db.lock_account(session)  # before reading what is reserved: a second payer then sees it already paid
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


def catch_up_candidates(session: Session, since: datetime) -> List[TransactionRow]:
    """Income that arrived since `since` and never had tax set aside: it predates the Tax Jar.

    Payments the user undid are labelled personal, so they are never picked up again.
    """
    rows = session.exec(
        select(TransactionRow)
        .where(TransactionRow.direction == "in")
        .where(TransactionRow.label == "income")
        .where(TransactionRow.reservation_id == None)  # noqa: E711 (SQL IS NULL)
        .where(TransactionRow.created_at >= since)
        .order_by(TransactionRow.created_at)
    ).all()
    return list(rows)


def catch_up_preview(session: Session, since: datetime) -> dict:
    """What `catch_up` would do, without moving money: count, income and tax, in the tax currency."""
    profile = db.get_profile(session)
    rows = catch_up_candidates(session, since) if profile.enabled else []
    income = sum(fx.convert(tx.amount, tx.currency, profile.tax_currency) for tx in rows)
    tax = sum(fx.convert(compute_tax(tx.amount, profile.rate_bp), tx.currency, profile.tax_currency) for tx in rows)
    return {
        "since": since.date(),
        "count": len(rows),
        "income": income,
        "reserved": tax,
        "taxCurrency": profile.tax_currency,
    }


def catch_up(session: Session, bus: EventBus, since: datetime) -> dict:
    """Set tax aside for every earlier income payment at once. Commits once; a second call moves nothing."""
    # Before reading the profile and the candidates: a profile change or a second catch-up in another
    # process then runs before or after this one, never in between.
    db.lock_account(session)
    profile = db.get_profile(session)
    if not profile.enabled:
        raise ApiError(409, "tax_profile_disabled", "Set up the Tax Jar first.")
    rows = catch_up_candidates(session, since)
    done: List[Tuple[TransactionRow, ReservationRow]] = []
    for tx in rows:
        reservation = reserve(session, tx, profile)
        if reservation is not None:
            done.append((tx, reservation))
    session.commit()

    for tx, _ in done:
        bus.publish("reservation.created", db.transaction_event(session, tx))
    return {
        "since": since.date(),
        "count": len(done),
        "income": sum(fx.convert(tx.amount, tx.currency, profile.tax_currency) for tx, _ in done),
        "reserved": sum(r.reserved_amount for _, r in done),
        "taxCurrency": profile.tax_currency,
    }
