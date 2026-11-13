"""Income-or-personal payment classifier.

A deterministic log-odds model over structural and behavioural evidence. There
is no vocabulary of "work" or "everyday" words: every signal is a property of
who paid, how the reference is shaped, how the amount compares to what this
owner usually receives, and how this payer has behaved before.

All weights are integer hundredths of a logit (100 = one nat). The score is the
resulting probability of "income" in whole percent, so 80 means 0.80.
"""
import math
from dataclasses import dataclass
from datetime import datetime, timezone
from statistics import mean, pstdev
from typing import Optional, Sequence

from .legal_forms import has_legal_form
from .names import normalize_name, same_party
from .reference import analyze_reference

RESERVE_AT = 80
ASK_AT = 40

PRIOR = -85                 # a payment from an unknown party is more likely personal than income

W_COMPANY = 190             # legal-entity form in the name, or the sender is declared a company
W_PERSON_DECLARED = -40     # the sender is declared a private person
W_RF_REFERENCE = 220        # valid ISO 11649 creditor reference
W_NUMERIC_REFERENCE = 60    # long numeric reference with a valid check digit
W_DOCUMENT_NUMBER = 130     # reference carries an invoice or order number; alone it must not auto-reserve
W_NO_REFERENCE = -20
W_FOREIGN_CURRENCY = 40     # paid in a currency other than the owner's home currency
W_SAME_AMOUNT = 60          # this payer already sent this exact amount
W_REGULAR_CADENCE = 120     # payments arrive on a steady schedule
W_REPEAT_BY_COUNT = {0: 0, 1: 40, 2: 80, 3: 100}
W_REPEAT_MAX = 120

SMALL_AMOUNT_MINOR = 5000   # used when the owner has no income history yet
MAGNITUDE_SCALE_UP = 100
MAGNITUDE_SCALE_DOWN = 150
MAGNITUDE_CAP_UP = 80
MAGNITUDE_CAP_DOWN = -150

CADENCE_MIN_PAYMENTS = 3    # prior payments needed before cadence is judged
CADENCE_MIN_DAYS = 5.0
CADENCE_MAX_DAYS = 100.0
CADENCE_MAX_VARIATION = 0.25


@dataclass(frozen=True)
class Result:
    label: str
    score: int
    confidence: float
    reasons: list


@dataclass(frozen=True)
class PriorPayment:
    """An earlier payment from the same payer."""
    at: datetime
    amount: int
    currency: str


@dataclass(frozen=True)
class OwnerContext:
    """What is known about the account owner."""
    home_currency: Optional[str] = None
    typical_income_minor: Optional[int] = None   # median size of past incoming payments


def infer_kind(sender_name: str, sender_kind: Optional[str]) -> str:
    """Return "company", "person" or "unknown"."""
    if sender_kind == "company" or has_legal_form(sender_name):
        return "company"       # a legal form in the name outweighs a declared "person"
    if sender_kind == "person":
        return "person"
    return "unknown"


def _magnitude(amount: int, owner: Optional[OwnerContext]) -> int:
    reference_amount = SMALL_AMOUNT_MINOR
    if owner and owner.typical_income_minor and owner.typical_income_minor > 0:
        reference_amount = owner.typical_income_minor
    if amount <= 0:
        return MAGNITUDE_CAP_DOWN
    ratio = math.log10(amount / reference_amount)
    scale = MAGNITUDE_SCALE_UP if ratio >= 0 else MAGNITUDE_SCALE_DOWN
    return max(MAGNITUDE_CAP_DOWN, min(MAGNITUDE_CAP_UP, round(ratio * scale)))


def _naive_utc(moment: datetime) -> datetime:
    if moment.tzinfo is None:
        return moment
    return moment.astimezone(timezone.utc).replace(tzinfo=None)


def _cadence_is_regular(history: Sequence[PriorPayment], now: Optional[datetime]) -> bool:
    moments = [_naive_utc(p.at) for p in history]
    if now is not None:
        moments.append(_naive_utc(now))
    moments.sort()
    if len(moments) < CADENCE_MIN_PAYMENTS + 1:
        return False
    gaps = [(b - a).total_seconds() / 86400 for a, b in zip(moments, moments[1:])]
    average = mean(gaps)
    if not CADENCE_MIN_DAYS <= average <= CADENCE_MAX_DAYS:
        return False
    return pstdev(gaps) / average <= CADENCE_MAX_VARIATION


def _repeat_weight(count: int) -> int:
    return min(W_REPEAT_MAX, W_REPEAT_BY_COUNT.get(count, W_REPEAT_MAX))


def classify(
    *,
    sender_name: str,
    sender_kind: Optional[str],
    amount: int,
    reference: str,
    owner_name: str,
    payer_status: Optional[str],
    currency: Optional[str] = None,
    history: Sequence[PriorPayment] = (),
    owner: Optional[OwnerContext] = None,
    now: Optional[datetime] = None,
) -> Result:
    sender_name = sender_name or ""
    reference = reference or ""
    # 1. The owner paying themselves is never income.
    if same_party(sender_name, owner_name):
        return Result("personal", 0, 0.99, ["transfer between your own accounts"])
    # 2. Only money actually received can be income.
    if amount <= 0:
        return Result("personal", 0, 0.99, ["not an incoming amount"])
    # 3. What the user taught us about this payer overrides every inference.
    if payer_status == "client":
        return Result("income", 100, 0.99, ["you marked this payer as a client"])
    if payer_status == "personal":
        return Result("personal", 0, 0.99, ["you marked this payer as personal"])

    z = PRIOR
    reasons = []

    kind = infer_kind(sender_name, sender_kind)
    if kind == "company":
        z += W_COMPANY
        reasons.append("company sender")
    elif kind == "person":
        z += W_PERSON_DECLARED

    ref = analyze_reference(reference)
    if ref.rf_reference:
        z += W_RF_REFERENCE
        reasons.append("structured payment reference")
    elif ref.numeric_reference:
        z += W_NUMERIC_REFERENCE
        reasons.append("structured payment reference")
    if ref.document_number:
        z += W_DOCUMENT_NUMBER
        reasons.append("invoice in reference")
    if ref.empty:
        z += W_NO_REFERENCE

    magnitude = _magnitude(amount, owner)
    if kind == "company":
        magnitude = max(0, magnitude)     # a company is never discounted for being small
    z += magnitude
    has_baseline = bool(owner and owner.typical_income_minor)
    if kind == "company":
        pass                              # the amount adds nothing to what the sender already shows
    elif magnitude >= 50:
        reasons.append("larger than your usual payment" if has_baseline else "sizeable amount")
    elif magnitude <= -50:
        reasons.append("smaller than your usual payment" if has_baseline else "small amount")

    if currency and owner and owner.home_currency and currency != owner.home_currency:
        z += W_FOREIGN_CURRENCY
        reasons.append("paid in a foreign currency")

    if history:
        z += _repeat_weight(len(history))
        reasons.append("this payer has paid you before")
        if any(p.amount == amount for p in history):
            z += W_SAME_AMOUNT
            reasons.append("same amount as an earlier payment")
        if _cadence_is_regular(history, now):
            z += W_REGULAR_CADENCE
            reasons.append("payments arrive on a regular schedule")

    probability = 1 / (1 + math.exp(-z / 100))
    score = max(0, min(100, round(probability * 100)))
    if score >= RESERVE_AT:
        return Result("income", score, score / 100, reasons)
    if score >= ASK_AT:
        return Result("unknown", score, score / 100, reasons)
    return Result("personal", score, 1 - score / 100, reasons)
