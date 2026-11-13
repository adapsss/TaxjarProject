"""Task C2: tax rules and country config."""

from datetime import date

from app.engine.tax_rules import compute_tax, get_regime, load_countries, next_deadline


def test_compute_tax():
    assert compute_tax(150000, 2000) == 30000
    assert compute_tax(2333, 2000) == 467
    assert compute_tax(2332, 2000) == 466
    assert compute_tax(100, 0) == 0


def test_ee_entrepreneur_default():
    assert get_regime("EE", "entrepreneur_account")["defaultRate"] == 2000


def test_unknown_regime():
    assert get_regime("EE", "nope") is None


def test_monthly_deadline():
    assert next_deadline("EE", "entrepreneur_account", date(2026, 11, 13)) == date(2026, 12, 10)
    assert next_deadline("EE", "entrepreneur_account", date(2026, 11, 10)) == date(2026, 11, 10)
    assert next_deadline("EE", "entrepreneur_account", date(2026, 12, 11)) == date(2027, 1, 10)


def test_quarterly_deadline():
    assert next_deadline("EE", "fie", date(2026, 11, 13)) == date(2026, 12, 15)
    assert next_deadline("EE", "fie", date(2026, 12, 16)) == date(2027, 3, 15)


def test_custom_has_no_deadline():
    assert next_deadline("*", "custom", date(2026, 11, 13)) is None


def test_load_countries_returns_a_copy():
    load_countries()[0]["name"] = "changed"
    assert load_countries()[0]["name"] == "Estonia"
