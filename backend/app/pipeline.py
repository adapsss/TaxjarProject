"""Incoming payment pipeline and the answer to "Is this payment for work?". Owned by Backend 2 (Task B4).

    save -> classify -> reserve / ask / personal -> commit once -> publish events
"""

import json
import unicodedata
from datetime import datetime, timezone
from typing import List, Optional

from sqlmodel import Session, select

from app import db, fx
from app.engine import classifier, owner_context, payer_history
from app.errors import ApiError
from app.events import EventBus
from app.models import BalanceRow, CounterpartyRow, TransactionRow
from app.reservations import get_transaction, reserve

REASON_CONFIRMED = "you confirmed this was for work"
REASON_DENIED = "you said this wasn't for work"
MAX_AMOUNT = 10**12  # ten billion in major units, far beyond any real payment
MAX_NAME_LENGTH = 140  # SEPA allows 70 characters for a party name, SWIFT 4 lines of 35
MAX_REFERENCE_LENGTH = 280  # two SEPA remittance lines


def _clean_text(value: Optional[str], field: str, max_length: int) -> str:
    """Trimmed text with single spaces. Rejects control characters (Postgres cannot store NUL) and
    anything longer than a bank would send, before a row is written or a name is analysed."""
    text = value or ""
    # Cc: control characters. Cs: a lone surrogate, which cannot be stored as UTF-8 either.
    if any(unicodedata.category(c) in ("Cc", "Cs") and c not in "\t\n\r" for c in text):
        raise ApiError(422, "validation_error", f"{field} must not contain control characters.")
    text = " ".join(text.split())
    if len(text) > max_length:
        raise ApiError(422, "validation_error", f"{field} must be at most {max_length} characters.")
    return text


def _past_payments(session: Session, key: str) -> List[dict]:
    """Earlier income from the same payer, as the engine's payer_history expects them.

    Only payments already labelled income count: a friend's repeated transfers or
    unanswered questions are not evidence that this payer is a client.
    """
    rows = session.exec(
        select(TransactionRow).where(
            TransactionRow.counterparty_key == key, TransactionRow.direction == "in", TransactionRow.label == "income"
        )
    ).all()
    name = session.get(CounterpartyRow, key)
    return [
        {"name": name.name if name else key, "created_at": db.as_utc(r.created_at), "amount": r.amount, "currency": r.currency}
        for r in rows
    ]


def _owner(session: Session, tax_currency: str) -> classifier.OwnerContext:
    """The owner's typical income, from payments already labelled income in the tax currency.

    home_currency stays None on purpose: with it, a USD payment gains the reason
    "paid in a foreign currency" and the demo's why line for Acme changes.
    """
    amounts = session.exec(
        select(TransactionRow.amount).where(
            TransactionRow.direction == "in", TransactionRow.label == "income", TransactionRow.currency == tax_currency
        )
    ).all()
    return classifier.OwnerContext(
        home_currency=None, typical_income_minor=owner_context(None, amounts).typical_income_minor
    )


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
    name = _clean_text(sender_name, "senderName", MAX_NAME_LENGTH)
    if not any(c.isalnum() for c in name):  # empty, or only spaces, punctuation or invisible characters
        raise ApiError(422, "validation_error", "senderName must not be blank.")
    if isinstance(amount, bool) or not isinstance(amount, int) or amount <= 0:
        raise ApiError(422, "validation_error", "amount must be a positive whole number of cents.")
    if amount > MAX_AMOUNT:
        # Keeps every sum of balances far inside a 64-bit integer.
        raise ApiError(422, "validation_error", "amount is too large.")
    currency = (currency or "").strip().upper()
    if not fx.is_supported(currency):
        raise ApiError(422, "unsupported_currency", f"{currency or 'That currency'} is not a supported currency.")
    reference = _clean_text(reference, "reference", MAX_REFERENCE_LENGTH)

    db.lock_account(session)
    profile = db.get_profile(session)

    # Locked until commit: concurrent payments in one currency must not overwrite each other's credit.
    balance = session.get(BalanceRow, currency, with_for_update=True, populate_existing=True)
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
        currency=currency,
        history=payer_history(name, _past_payments(session, key)),
        owner=_owner(session, profile.tax_currency),
        now=datetime.now(timezone.utc),
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
    db.lock_account(session)
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
