"""Incoming payment pipeline and the answer to "Is this payment for work?". Owned by Backend 2 (Task B4).

    save -> classify -> reserve / ask / personal -> commit once -> publish events
"""

import json
from typing import Optional

from sqlmodel import Session

from app import db, fx
from app.engine import classifier
from app.errors import ApiError
from app.events import EventBus
from app.models import BalanceRow, CounterpartyRow, TransactionRow
from app.reservations import get_transaction, reserve

REASON_CONFIRMED = "you confirmed this was for work"
REASON_DENIED = "you said this wasn't for work"
MAX_AMOUNT = 10**12  # ten billion in major units, far beyond any real payment


def process_incoming(
    session: Session,
    bus: EventBus,
    *,
    sender_name: str,
    sender_kind: Optional[str],
    amount: int,
    currency: str,
    reference: str,
) -> TransactionRow:
    # Reject bad input before anything is written.
    name = (sender_name or "").strip()
    if not name:
        raise ApiError(422, "validation_error", "senderName must not be blank.")
    if isinstance(amount, bool) or not isinstance(amount, int) or amount <= 0:
        raise ApiError(422, "validation_error", "amount must be a positive whole number of cents.")
    if amount > MAX_AMOUNT:
        # Larger values do not fit a SQLite integer once balances add up.
        raise ApiError(422, "validation_error", "amount is too large.")
    currency = (currency or "").strip().upper()
    if not fx.is_supported(currency):
        raise ApiError(422, "unsupported_currency", f"{currency or 'That currency'} is not supported. Use EUR, USD or GBP.")
    reference = reference or ""

    profile = db.get_profile(session)

    balance = session.get(BalanceRow, currency)
    if balance is None:
        balance = BalanceRow(currency=currency, amount=0)
    balance.amount += amount
    session.add(balance)

    key = classifier.normalize_name(name)
    counterparty = session.get(CounterpartyRow, key)
    if counterparty is None:
        counterparty = CounterpartyRow(key=key, name=name, kind=classifier.infer_kind(name, sender_kind))
    elif sender_kind and counterparty.kind == "unknown":
        counterparty.kind = sender_kind
    session.add(counterparty)

    result = classifier.classify(
        sender_name=name,
        sender_kind=sender_kind,
        amount=amount,
        reference=reference,
        owner_name=profile.owner_name,
        payer_status=counterparty.status,
    )
    tx = TransactionRow(
        direction="in",
        amount=amount,
        currency=currency,
        counterparty_key=key,
        reference=reference,
        label=result.label,
        confidence=result.confidence,
        reasons_json=json.dumps(result.reasons),
    )
    session.add(tx)
    session.flush()

    reservation = None
    if profile.enabled and result.label == "income":
        reservation = reserve(session, tx, profile)
    session.commit()

    bus.publish("transaction.created", db.transaction_event(session, tx))
    if reservation is not None:
        bus.publish("reservation.created", db.transaction_event(session, tx))
    elif profile.enabled and result.label == "unknown":
        bus.publish("question.asked", db.transaction_event(session, tx))
    return tx


def answer(session: Session, bus: EventBus, tx_id: str, is_income: bool) -> TransactionRow:
    """Apply the user's answer and remember it for the payer. A second answer changes nothing."""
    tx = get_transaction(session, tx_id)
    profile = db.get_profile(session)
    if not profile.enabled:
        raise ApiError(409, "tax_profile_disabled", "Set up the Tax Jar first, then answer.")
    if tx.label != "unknown":
        return tx

    counterparty = session.get(CounterpartyRow, tx.counterparty_key)
    reservation = None
    tx.confidence = 0.99
    if is_income:
        tx.label = "income"
        tx.reasons_json = json.dumps([REASON_CONFIRMED])
        counterparty.status = "client"
        reservation = reserve(session, tx, profile)
    else:
        tx.label = "personal"
        tx.reasons_json = json.dumps([REASON_DENIED])
        counterparty.status = "personal"
    session.add_all([tx, counterparty])
    session.commit()

    if reservation is not None:
        bus.publish("reservation.created", db.transaction_event(session, tx))
    return tx
