"""Rule-based income-or-personal classifier (Task C1). Pure functions, standard library only.

Scores, weights and thresholds are integer hundredths: 80 means 0.80.
Every payment starts at BASELINE (shared plan, decision 1).
"""

import re
from dataclasses import dataclass, field
from typing import List, Optional

BASELINE = 30
RESERVE_AT = 80
ASK_AT = 40
W_COMPANY = 45
W_INVOICE = 35
W_WORK = 15
W_EVERYDAY = -40
W_SMALL_PERSON = -25
SMALL_AMOUNT_MINOR = 5000  # "amount < 50", in the payment's own currency

REASON_SELF = "transfer between your own accounts"
REASON_CLIENT = "you marked this payer as a client"
REASON_PERSONAL = "you marked this payer as personal"
REASON_COMPANY = "company sender"
REASON_INVOICE = "invoice in reference"
REASON_WORK = "work-related reference"
REASON_EVERYDAY = "everyday reference"
REASON_SMALL = "small amount from a private person"

# Whole-word legal-entity tokens. Short Baltic ones are case-sensitive so "Sia Kask" or "Astrid" never match.
_COMPANY_CASE_SENSITIVE = re.compile(r"(?<!\w)(?:OÜ|AS|SIA|UAB)(?!\w)")
_COMPANY_ANY_CASE = re.compile(
    r"(?<!\w)(?:(?:ltd|llc|inc|gmbh)\.?|sp\.\s*z\s*o\.\s*o\.?)(?!\w)",
    re.IGNORECASE,
)
_INVOICE = re.compile(r"invoice|inv-|arve|rechnung|faktura|#\d+", re.IGNORECASE)
_WORK_WORDS = ("website", "design", "consulting", "project", "services")
_EVERYDAY_WORDS = ("pizza", "dinner", "beer", "rent share", "split", "birthday")
_EVERYDAY_EMOJI = ("🍕", "🍔", "🍺", "🍻", "🍷", "🍣", "🎂")


@dataclass(frozen=True)
class Result:
    label: str  # "income" | "personal" | "unknown"
    score: int
    confidence: float
    reasons: List[str] = field(default_factory=list)


def normalize_name(name: str) -> str:
    """Casefold, trim, collapse inner whitespace. Used as the payer key."""
    return " ".join(name.casefold().split())


def _has_legal_entity(name: str) -> bool:
    return bool(_COMPANY_CASE_SENSITIVE.search(name) or _COMPANY_ANY_CASE.search(name))


def infer_kind(sender_name: str, sender_kind: Optional[str]) -> str:
    """"company" | "person" | "unknown": the explicit kind wins, else a legal-entity token means company."""
    if sender_kind:
        return sender_kind
    return "company" if _has_legal_entity(sender_name) else "unknown"


def classify(
    *,
    sender_name: str,
    sender_kind: Optional[str],
    amount: int,
    reference: str,
    owner_name: str,
    payer_status: Optional[str],
) -> Result:
    if normalize_name(sender_name) == normalize_name(owner_name):
        return Result("personal", 0, 0.99, [REASON_SELF])
    if payer_status == "client":
        return Result("income", 100, 0.99, [REASON_CLIENT])
    if payer_status == "personal":
        return Result("personal", 0, 0.99, [REASON_PERSONAL])

    score = BASELINE
    reasons: List[str] = []
    text = (reference or "").casefold()

    if sender_kind == "company" or _has_legal_entity(sender_name):
        score += W_COMPANY
        reasons.append(REASON_COMPANY)
    if _INVOICE.search(reference or ""):
        score += W_INVOICE
        reasons.append(REASON_INVOICE)
    if any(word in text for word in _WORK_WORDS):
        score += W_WORK
        reasons.append(REASON_WORK)
    if any(word in text for word in _EVERYDAY_WORDS) or any(e in (reference or "") for e in _EVERYDAY_EMOJI):
        score += W_EVERYDAY
        reasons.append(REASON_EVERYDAY)
    if infer_kind(sender_name, sender_kind) != "company" and amount < SMALL_AMOUNT_MINOR:
        score += W_SMALL_PERSON
        reasons.append(REASON_SMALL)

    score = max(0, min(100, score))
    if score >= RESERVE_AT:
        return Result("income", score, score / 100, reasons)
    if score >= ASK_AT:
        return Result("unknown", score, score / 100, reasons)
    return Result("personal", score, round(1 - score / 100, 2), reasons)
