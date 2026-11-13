from datetime import datetime, timedelta

from app.engine import find_violations, owner_context, payer_history

OPENING = {"EUR": 245000, "USD": 32000, "GBP": 15000}
ACME = {"status": "reserved", "source_amount": 30000, "source_currency": "USD", "reserved_amount": 27600}


def check(**overrides):
    args = dict(
        balances={"EUR": 245000, "USD": 152000, "GBP": 15000},
        jar_balances={"tax": 27600, "holiday": 60000},
        tax_jar_id="tax",
        reservations=[ACME],
        opening_balances=OPENING,
        incoming=[("USD", 150000)],
    )
    args.update(overrides)
    return find_violations(**args)


def test_balanced_books():
    assert check() == []


def test_jar_out_of_step_with_reservations():
    assert any("tax jar holds" in p for p in check(jar_balances={"tax": 27000}))


def test_undone_reservation_must_leave_the_jar():
    undone = dict(ACME, status="undone")
    problems = check(reservations=[undone])
    assert any("tax jar holds" in p for p in problems)
    assert any("balance USD" in p for p in problems)
    assert check(reservations=[undone], jar_balances={"tax": 0}, balances={"EUR": 245000, "USD": 182000, "GBP": 15000}) == []


def test_paid_reservation_keeps_the_source_deducted():
    paid = dict(ACME, status="paid")
    assert check(reservations=[paid], jar_balances={"tax": 0}) == []


def test_negative_balances_are_reported():
    problems = check(balances={"EUR": -1, "USD": 152000, "GBP": 15000})
    assert any("negative" in p for p in problems)


def test_money_appearing_from_nowhere_is_reported():
    assert any("balance GBP" in p for p in check(balances={"EUR": 245000, "USD": 152000, "GBP": 15001}))


def test_missing_tax_jar():
    assert any("does not exist" in p for p in check(jar_balances={}))


def test_outgoing_payments_are_accounted():
    assert check(balances={"EUR": 240000, "USD": 152000, "GBP": 15000}, outgoing=[("EUR", 5000)]) == []


def test_owner_context_needs_enough_payments():
    assert owner_context("EUR", [10000, 20000]).typical_income_minor is None
    assert owner_context("EUR", [10000, 20000, 30000, 40000, 50000]).typical_income_minor == 30000
    assert owner_context("EUR", []).home_currency == "EUR"
    assert owner_context("EUR", [], min_payments=0).typical_income_minor is None


def test_payer_history_matches_the_same_payer_only():
    t = datetime(2026, 11, 1)
    past = [
        {"sender_name": "John Smith", "created_at": t, "amount": 40000, "currency": "EUR"},
        {"sender_name": "smith  JOHN", "created_at": t + timedelta(days=1), "amount": 100, "currency": "EUR"},
        {"sender_name": "Mari Tamm", "created_at": t, "amount": 2300, "currency": "EUR"},
    ]
    assert [p.amount for p in payer_history("John Smith", past)] == [40000, 100]
