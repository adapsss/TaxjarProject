"""Split of a reserved amount into the taxes it pays for.

A split in money is given only where the law defines one for each payment
(the regime's `components`). Everywhere else the engine describes the rule in
words and returns no amounts: a proportional guess would look exact and is not.
"""
from typing import Optional


def _largest_remainder(amount: int, weights: list) -> list:
    """Divide `amount` by integer weights so the parts add up to it exactly."""
    total = sum(weights)
    parts = [amount * w // total for w in weights]
    remainders = sorted(range(len(weights)), key=lambda i: (-(amount * weights[i] % total), i))
    for i in remainders[: amount - sum(parts)]:
        parts[i] += 1
    return parts


def split_tax(amount: int, regime: dict, rate_bp: Optional[int] = None) -> Optional[list]:
    """Exact parts of a reserved amount, or None when the regime defines no per-payment split.

    `rate_bp` is the rate the reservation was made at. It must be the regime's
    own rate, or that rate plus one of the regime's optional extra rates (the
    funded pension contribution of the Estonian entrepreneur account); at any
    other rate the split is not defined and None is returned.
    """
    components = regime.get("components")
    if not components or amount is None or amount < 0:
        return None
    base_rate = regime["suggestedReserveRateBp"]
    rate_bp = base_rate if rate_bp is None else rate_bp
    extra = regime.get("extraComponent")
    extra_amount = 0
    if rate_bp != base_rate:
        if not extra or rate_bp - base_rate not in extra["ratesBp"]:
            return None
        extra_amount = _largest_remainder(amount, [rate_bp - base_rate, base_rate])[0]
    shares = _largest_remainder(amount - extra_amount, [c["shareNum"] for c in components])
    parts = [{"id": c["id"], "name": c["name"], "amount": part} for c, part in zip(components, shares)]
    if extra_amount:
        parts.append({"id": extra["id"], "name": extra["name"], "amount": extra_amount})
    return parts


def _percent(rate_bp: int) -> str:
    whole, fraction = divmod(rate_bp, 100)
    return "%d%%" % whole if fraction == 0 else ("%d.%02d" % (whole, fraction)).rstrip("0") + "%"


def describe_rule(regime: dict) -> str:
    """The regime's taxes in words, e.g. "22% income tax on profit + 33% social tax".

    Uses the regime's own `ruleText` when the data has one, otherwise a generic
    sentence built from its rates, so every taxed regime gets a description.
    """
    components = regime.get("components")
    if components:
        base = regime["suggestedReserveRateBp"]
        total = sum(c["shareNum"] for c in components)
        named = ", ".join(
            "%s %s" % (_percent(base * c["shareNum"] // total), c["name"].lower()) for c in components
        )
        return "%s of each payment: %s" % (_percent(base), named)
    if regime.get("ruleText"):
        return regime["ruleText"]
    spec = regime.get("incomeTax") or {}
    pieces = []
    if spec.get("type") == "flat" and spec.get("rateBp"):
        pieces.append("%s income tax" % _percent(spec["rateBp"]))
    elif spec.get("type") == "progressive" and spec.get("brackets"):
        rates = [b["rateBp"] for b in spec["brackets"]]
        pieces.append("income tax from %s to %s" % (_percent(min(rates)), _percent(max(rates))))
    # contribution names and tiers come from research in many languages, so they are
    # not repeated here: one rate is quoted only when there is exactly one item
    items = regime.get("socialContributions") or []
    if len(items) == 1 and items[0].get("rateBp"):
        pieces.append("%s social contributions" % _percent(items[0]["rateBp"]))
    elif items:
        pieces.append("social contributions")
    if not pieces and regime.get("suggestedReserveRateBp") and spec.get("type"):
        pieces.append("about %s of income" % _percent(regime["suggestedReserveRateBp"]))
    return " + ".join(pieces)
