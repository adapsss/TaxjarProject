"""Money invariants of the tax jar, checked on plain numbers.

`find_violations` returns human-readable descriptions of every broken
invariant; an empty list means the books balance. The test helper for the
database session only has to load the numbers and call it.
"""
from typing import Iterable, Mapping, Tuple


def _get(record, name, default=None):
    if isinstance(record, dict):
        return record.get(name, default)
    return getattr(record, name, default)


def find_violations(
    *,
    balances: Mapping[str, int],
    jar_balances: Mapping[str, int],
    tax_jar_id: str,
    reservations: Iterable,
    opening_balances: Mapping[str, int],
    incoming: Iterable[Tuple[str, int]] = (),
    outgoing: Iterable[Tuple[str, int]] = (),
) -> list:
    """Check the three invariants.

    1. The tax jar holds exactly the sum of `reserved_amount` over reservations with status "reserved".
    2. No balance and no jar is negative.
    3. Per currency: balance == opening balance + incoming since opening - outgoing since opening
       - `source_amount` of reservations with status "reserved" or "paid".

    `incoming` and `outgoing` are (currency, amount) pairs for transactions made
    after the opening balances were taken (i.e. not part of the seed). Tax
    payments out of the jar do not touch a currency balance and are not listed.
    """
    reservations = list(reservations)
    problems = []

    held = sum(_get(r, "reserved_amount") or 0 for r in reservations if _get(r, "status") == "reserved")
    jar = jar_balances.get(tax_jar_id)
    if jar is None:
        problems.append("tax jar %r does not exist" % tax_jar_id)
    elif jar != held:
        problems.append("tax jar holds %d but active reservations add up to %d" % (jar, held))

    for currency, amount in sorted(balances.items()):
        if amount < 0:
            problems.append("balance %s is negative: %d" % (currency, amount))
    for jar_id, amount in sorted(jar_balances.items()):
        if amount < 0:
            problems.append("jar %s is negative: %d" % (jar_id, amount))

    expected = dict(opening_balances)
    for currency, amount in incoming:
        expected[currency] = expected.get(currency, 0) + amount
    for currency, amount in outgoing:
        expected[currency] = expected.get(currency, 0) - amount
    for r in reservations:
        if _get(r, "status") in ("reserved", "paid"):
            currency = _get(r, "source_currency")
            expected[currency] = expected.get(currency, 0) - (_get(r, "source_amount") or 0)
    for currency in sorted(set(expected) | set(balances)):
        actual, wanted = balances.get(currency, 0), expected.get(currency, 0)
        if actual != wanted:
            problems.append("balance %s is %d but the ledger gives %d" % (currency, actual, wanted))
    return problems
