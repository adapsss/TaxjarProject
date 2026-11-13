"""Money invariants (Task C3). Import with `from invariants import assert_invariants`.

A failure here is a money bug in the pipeline: fix the pipeline, not this helper.
"""

from collections import Counter, defaultdict

from sqlmodel import select

from app import db
from app.models import TAX_JAR_ID, BalanceRow, JarRow, ReservationRow, TransactionRow


def _seed_key(direction, amount, currency, created_at):
    return (direction, amount, currency, db.as_utc(created_at))


def assert_invariants(session) -> None:
    session.expire_all()
    seed = db.load_seed(session)
    reservations = session.exec(select(ReservationRow)).all()
    balances = session.exec(select(BalanceRow)).all()
    jars = session.exec(select(JarRow)).all()

    # 1. The Tax Jar holds exactly what is reserved and not yet paid or undone.
    tax_jar = session.get(JarRow, TAX_JAR_ID)
    reserved_total = sum(r.reserved_amount for r in reservations if r.status == "reserved")
    assert tax_jar.balance == reserved_total, f"tax jar {tax_jar.balance} != reserved {reserved_total}"

    # 2. Nothing is negative.
    for balance in balances:
        assert balance.amount >= 0, f"{balance.currency} balance is {balance.amount}"
    for jar in jars:
        assert jar.balance >= 0, f"jar {jar.id} is {jar.balance}"

    # 3. Each balance == seed + new incoming payments - tax taken from it (reserved or paid).
    seed_rows = Counter(
        _seed_key(t["direction"], t["amount"], t["currency"], db.parse_timestamp(t["createdAt"]))
        for t in seed["transactions"]
    )
    received = defaultdict(int)
    for tx in session.exec(select(TransactionRow).where(TransactionRow.direction == "in")).all():
        key = _seed_key(tx.direction, tx.amount, tx.currency, tx.created_at)
        if seed_rows[key] > 0:
            seed_rows[key] -= 1
            continue
        received[tx.currency] += tx.amount
    taken = defaultdict(int)
    for r in reservations:
        if r.status in ("reserved", "paid"):
            taken[r.source_currency] += r.source_amount

    seed_balances = {b["currency"]: b["amount"] for b in seed["balances"]}
    actual = {b.currency: b.amount for b in balances}
    for currency in set(seed_balances) | set(actual):
        expected = seed_balances.get(currency, 0) + received[currency] - taken[currency]
        assert actual.get(currency, 0) == expected, f"{currency}: balance {actual.get(currency, 0)} != {expected}"
