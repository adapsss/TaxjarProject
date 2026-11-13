"""Helpers that turn stored payments into the classifier's optional context."""
from statistics import median_low
from typing import Iterable, Optional

from .classifier import OwnerContext, PriorPayment
from .names import same_party


def owner_context(home_currency: Optional[str], income_amounts: Iterable[int] = (),
                  min_payments: int = 5) -> OwnerContext:
    """Owner context from past payments already known to be income.

    The typical income is the median of `income_amounts`; it stays unset until
    there are `min_payments` of them, so a new account is judged on absolute
    amounts instead of on one or two data points.
    """
    amounts = [a for a in income_amounts if a and a > 0]
    typical = median_low(amounts) if amounts and len(amounts) >= min_payments else None
    return OwnerContext(home_currency=home_currency, typical_income_minor=typical)


def payer_history(sender_name: str, past_payments: Iterable) -> list:
    """Earlier incoming payments from the same payer, as the classifier expects them.

    `past_payments` are objects or dicts with `sender_name` (or `name`), `created_at`,
    `amount` and `currency`. Matching uses the same rule as own-account detection.
    """
    history = []
    for p in past_payments:
        get = p.get if isinstance(p, dict) else lambda k, d=None, _p=p: getattr(_p, k, d)
        name = get("sender_name") or get("name") or ""
        if same_party(name, sender_name):
            history.append(PriorPayment(at=get("created_at"), amount=get("amount"), currency=get("currency")))
    return history
