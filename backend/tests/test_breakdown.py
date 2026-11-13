from datetime import date, datetime

from app.engine import build_summary, describe_rule, export_rows, get_regime, split_tax

ACCOUNT = get_regime("EE", "entrepreneur_account")
FIE = get_regime("EE", "fie")


def amounts(parts):
    return {p["id"]: p["amount"] for p in parts}


def test_entrepreneur_account_splits_22_to_33():
    # the demo toast: 276.00 EUR is 110.40 income tax and 165.60 social tax
    assert amounts(split_tax(27600, ACCOUNT)) == {"income_tax": 11040, "social_tax": 16560}


def test_parts_always_add_up():
    for amount in range(0, 5000, 7):
        assert sum(p["amount"] for p in split_tax(amount, ACCOUNT)) == amount
        assert sum(p["amount"] for p in split_tax(amount, ACCOUNT, 2600)) == amount


def test_funded_pension_rates():
    # 26% of 100.00: 6.00 pension, then 20.00 split 8.00 and 12.00
    assert amounts(split_tax(2600, ACCOUNT, 2600)) == {"income_tax": 800, "social_tax": 1200, "funded_pension": 600}
    assert amounts(split_tax(2200, ACCOUNT, 2200))["funded_pension"] == 200


def test_no_split_at_a_rate_the_law_does_not_define():
    assert split_tax(27600, ACCOUNT, 2500) is None
    assert split_tax(27600, ACCOUNT, 1000) is None


def test_fie_has_a_rule_but_no_amounts():
    assert split_tax(27600, FIE) is None
    assert describe_rule(FIE) == "22% income tax on profit + 33% social tax"


def test_rule_text_for_the_exact_regime():
    assert describe_rule(ACCOUNT) == "20% of each payment: 8% income tax, 12% social tax"


def test_every_regime_has_a_rule_or_is_tax_free():
    from app.engine.tax_rules import _raw

    for country in _raw():
        for regime in country["regimes"]:
            text = describe_rule(regime)
            assert isinstance(text, str)
            taxed = regime["suggestedReserveRateBp"] > 0 and country["code"] != "*"
            assert bool(text) or not taxed, country["code"] + "/" + regime["id"]
            assert text == text.strip() and "  " not in text


def row(**overrides):
    base = {"status": "reserved", "created_at": datetime(2026, 11, 13), "payer": "Acme Inc.", "reference": "INV-042",
            "source_amount": 30000, "source_currency": "USD", "rate_bp": 2000, "fx_rate": 0.92,
            "reserved_amount": 27600, "tax_currency": "EUR"}
    base.update(overrides)
    return base


def summary(rows, regime="entrepreneur_account"):
    return build_summary(rows, tax_currency="EUR", country="EE", regime=regime, today=date(2026, 11, 13))


def test_summary_breakdown_adds_up_to_the_total():
    result = summary([row(), row(reserved_amount=8000), row(status="paid"), row(status="undone")])
    assert amounts(result["breakdown"]) == {"income_tax": 14240, "social_tax": 21360}
    assert sum(p["amount"] for p in result["breakdown"]) == result["total_reserved"] == 35600
    assert result["breakdown_rule"]


def test_summary_breakdown_is_zero_when_empty_and_absent_for_fie():
    assert amounts(summary([])["breakdown"]) == {"income_tax": 0, "social_tax": 0}
    fie = summary([row(rate_bp=4500)], regime="fie")
    assert fie["breakdown"] is None
    assert "33% social tax" in fie["breakdown_rule"]


def test_summary_gives_no_breakdown_if_any_reservation_has_an_undefined_rate():
    assert summary([row(), row(rate_bp=2500)])["breakdown"] is None


def test_export_breakdown_column_only_for_exact_regimes():
    exact = export_rows([row()], ACCOUNT)
    assert exact[0][-1] == "breakdown"
    assert exact[1][-1] == "income_tax=110.40; social_tax=165.60"
    assert export_rows([row()], FIE)[0][-1] == "status"
    assert export_rows([row()])[0][-1] == "status"
