from datetime import date

from app.engine.tax_rules import (
    compute_tax,
    deadline_after,
    estimate_annual_tax,
    get_regime,
    load_countries,
    next_deadline,
)

MONTHLY = [{"name": "m", "type": "monthly", "day": 10}]
QUARTERLY = [{"name": "q", "type": "quarterly", "day": 15, "months": [3, 6, 9, 12]}]
ANNUAL = [{"name": "a", "type": "annual", "day": 30, "month": 4}]

PROGRESSIVE = {
    "incomeTax": {
        "type": "progressive",
        "brackets": [{"upToMinor": 1000000, "rateBp": 1000}, {"upToMinor": None, "rateBp": 3000}],
    },
    "allowanceMinor": 500000,
    "socialContributions": [
        {"name": "pension", "rateBp": 1000, "floorMinor": None, "capMinor": 2000000, "fixedAnnualMinor": None},
        {"name": "health", "rateBp": None, "floorMinor": None, "capMinor": None, "fixedAnnualMinor": 60000},
    ],
    "suggestedReserveRateBp": 2500,
}
FLAT = {"incomeTax": {"type": "flat", "rateBp": 2000}, "socialContributions": [], "suggestedReserveRateBp": 2000}
NONE = {"incomeTax": {"type": "none"}, "socialContributions": [], "suggestedReserveRateBp": 0}


def test_compute_tax_rounds_half_up():
    assert compute_tax(150000, 2000) == 30000
    assert compute_tax(2333, 2000) == 467
    assert compute_tax(2332, 2000) == 466
    assert compute_tax(100, 0) == 0


def test_progressive_estimate():
    # taxable 3,000,000 - 500,000 = 2,500,000: 10% of 1,000,000 + 30% of 1,500,000 = 550,000
    # social: 10% of min(3,000,000, cap 2,000,000) + fixed 60,000 = 260,000
    assert estimate_annual_tax(PROGRESSIVE, 3000000) == {"incomeTax": 550000, "social": 260000, "total": 810000}


def test_income_below_allowance_pays_no_income_tax():
    assert estimate_annual_tax(PROGRESSIVE, 400000)["incomeTax"] == 0


def test_flat_and_none_estimates():
    assert estimate_annual_tax(FLAT, 1000000)["total"] == 200000
    assert estimate_annual_tax(NONE, 1000000)["total"] == 0
    assert estimate_annual_tax(FLAT, 0)["total"] == 0


def test_incomplete_regime_is_not_estimated():
    import pytest

    with pytest.raises(ValueError):
        estimate_annual_tax(dict(FLAT, computable=False, id="x"), 1000000)


def test_unknown_deadline_shape_is_ignored():
    assert deadline_after([{"type": "weekly", "day": 1}], date(2026, 1, 1)) is None
    assert deadline_after([{"type": "weekly", "day": 1, "months": [1]}], date(2026, 1, 1)) is None
    assert deadline_after([{"type": "monthly"}], date(2026, 1, 1)) is None


def test_monthly_deadline():
    assert deadline_after(MONTHLY, date(2026, 11, 13)) == date(2026, 12, 10)
    assert deadline_after(MONTHLY, date(2026, 11, 10)) == date(2026, 11, 10)
    assert deadline_after(MONTHLY, date(2026, 12, 11)) == date(2027, 1, 10)


def test_quarterly_deadline():
    assert deadline_after(QUARTERLY, date(2026, 11, 13)) == date(2026, 12, 15)
    assert deadline_after(QUARTERLY, date(2026, 12, 16)) == date(2027, 3, 15)


def test_annual_deadline():
    assert deadline_after(ANNUAL, date(2026, 11, 13)) == date(2027, 4, 30)
    assert deadline_after(ANNUAL, date(2026, 4, 30)) == date(2026, 4, 30)


def test_nearest_of_several_rules_wins():
    assert deadline_after(ANNUAL + QUARTERLY, date(2026, 4, 1)) == date(2026, 4, 30)


def test_day_is_clamped_to_month_length():
    assert deadline_after([{"type": "monthly", "day": 31}], date(2027, 2, 1)) == date(2027, 2, 28)


def test_no_rules_no_deadline():
    assert deadline_after([], date(2026, 11, 13)) is None
    assert next_deadline("*", "custom", date(2026, 11, 13)) is None


def test_estonia_regimes():
    regime = get_regime("EE", "entrepreneur_account")
    assert regime["suggestedReserveRateBp"] == regime["defaultRate"] == 2000
    assert regime["hint"]
    assert next_deadline("EE", "entrepreneur_account", date(2026, 11, 13)) == date(2026, 12, 10)
    assert next_deadline("EE", "entrepreneur_account", date(2026, 11, 10)) == date(2026, 11, 10)
    assert get_regime("EE", "fie") is not None


def test_regime_lookup_is_exact():
    assert get_regime("EE", "nope") is None
    assert get_regime("EE", "custom") is None
    assert get_regime("XX", "custom") is None
    assert get_regime("*", "custom")["suggestedReserveRateBp"] == 2000


def test_load_countries_api_shape():
    countries = load_countries()
    assert countries[-1]["code"] == "*"
    for country in countries:
        assert set(country) == {"code", "name", "currency", "regimes"}
        for regime in country["regimes"]:
            assert set(regime) == {"id", "name", "defaultRate", "hint", "deadline", "breakdownRule"}
            assert isinstance(regime["defaultRate"], int)
