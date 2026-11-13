from datetime import datetime, timedelta

from app.engine import format_minor, format_rate_percent, owner_context, payer_history


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


def test_amount_formatting_follows_the_currency():
    assert format_minor(30000, "USD") == "300.00"
    assert format_minor(5, "EUR") == "0.05"
    assert format_minor(1500, "JPY") == "1500"
    assert format_minor(1500, "KWD") == "1.500"
    assert format_minor(-250, "EUR") == "-2.50"
    assert format_minor(None, "EUR") == ""


def test_rate_formatting():
    assert [format_rate_percent(r) for r in (2000, 2250, 2205, 0, 50, -250)] == ["20", "22.5", "22.05", "0", "0.5", "-2.5"]
