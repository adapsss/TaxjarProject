from app.engine import describe_rule, get_regime, split_tax
from helpers import ACME, JOHN, answer, simulate, undo

class _Regime(dict):
    """Looks a regime up on first use: tax data comes from the database, which is ready only once tests run."""

    def __init__(self, country, regime):
        super().__init__()
        self._key = (country, regime)

    def _load(self):
        if not dict.__len__(self):
            self.update(get_regime(*self._key))
        return self

    def __getitem__(self, k):
        return dict.__getitem__(self._load(), k)

    def get(self, k, default=None):
        return dict.get(self._load(), k, default)

    def __bool__(self):
        return True


ACCOUNT = _Regime("EE", "entrepreneur_account")
FIE = _Regime("EE", "fie")


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


# --- through the API -------------------------------------------------------


def set_profile(client, **changes):
    body = {"country": "EE", "regime": "entrepreneur_account", "rate": 2000, "taxCurrency": "EUR", "enabled": True}
    body.update(changes)
    response = client.put("/api/tax-profile", json=body)
    assert response.status_code == 200, response.text


def test_reservation_carries_the_exact_split(client, onboarded):
    acme = simulate(client, ACME)
    parts = acme["reservation"]["breakdown"]
    assert amounts(parts) == {"income_tax": 11040, "social_tax": 16560}
    assert sum(p["amount"] for p in parts) == acme["reservation"]["reservedAmount"] == 27600
    listed = client.get("/api/transactions").json()[0]
    assert listed["reservation"]["breakdown"] == parts


def test_events_carry_the_split(client, onboarded, events):
    simulate(client, ACME)
    data = next(d for t, d in events if t == "reservation.created")
    assert amounts(data["transaction"]["reservation"]["breakdown"]) == {"income_tax": 11040, "social_tax": 16560}


def test_summary_breakdown_adds_up_to_the_total(client, onboarded):
    simulate(client, ACME)
    john = simulate(client, JOHN)
    answer(client, john["id"], True)
    summary = client.get("/api/tax/summary").json()
    assert amounts(summary["breakdown"]) == {"income_tax": 14240, "social_tax": 21360}
    assert sum(p["amount"] for p in summary["breakdown"]) == summary["totalReserved"] == 35600
    assert summary["breakdownRule"] == "20% of each payment: 8% income tax, 12% social tax"


def test_summary_breakdown_follows_undo_and_pay(client, onboarded):
    acme = simulate(client, ACME)
    undo(client, acme["id"])
    assert amounts(client.get("/api/tax/summary").json()["breakdown"]) == {"income_tax": 0, "social_tax": 0}
    simulate(client, ACME)
    client.post("/api/tax/pay")
    assert amounts(client.get("/api/tax/summary").json()["breakdown"]) == {"income_tax": 0, "social_tax": 0}


def test_fie_shows_the_rule_and_no_amounts(client, onboarded):
    set_profile(client, regime="fie", rate=4500)
    acme = simulate(client, ACME)
    assert acme["reservation"]["breakdown"] is None
    summary = client.get("/api/tax/summary").json()
    assert summary["breakdown"] is None
    assert summary["breakdownRule"] == "22% income tax on profit + 33% social tax"


def test_no_split_at_a_rate_the_law_does_not_define_through_the_api(client, onboarded):
    set_profile(client, rate=2500)
    acme = simulate(client, ACME)
    assert acme["reservation"]["breakdown"] is None
    assert client.get("/api/tax/summary").json()["breakdown"] is None


def test_funded_pension_rate_adds_a_third_part(client, onboarded):
    set_profile(client, rate=2600)
    parts = simulate(client, ACME)["reservation"]["breakdown"]
    assert [p["id"] for p in parts] == ["income_tax", "social_tax", "funded_pension"]
    summary = client.get("/api/tax/summary").json()
    assert sum(p["amount"] for p in summary["breakdown"]) == summary["totalReserved"]


def test_countries_carry_the_rule_text(client):
    estonia = next(c for c in client.get("/api/tax/countries").json() if c["code"] == "EE")
    rules = {r["id"]: r["breakdownRule"] for r in estonia["regimes"]}
    assert rules["fie"] == "22% income tax on profit + 33% social tax"
    assert rules["entrepreneur_account"].startswith("20% of each payment")


def test_export_guards_against_spreadsheet_formulas(client, onboarded):
    simulate(client, {"senderName": "=cmd Ltd", "amount": 150000, "currency": "USD", "reference": "@INV-042"})
    line = client.get("/api/tax/export.csv").text.splitlines()[1]
    assert ",'=cmd Ltd,'@INV-042," in line


def test_split_does_not_follow_a_later_regime_change(client, onboarded):
    # 22% under FIE happens to equal the entrepreneur account's 20% plus a 2% pension rate
    set_profile(client, regime="fie", rate=2200)
    fie_payment = simulate(client, ACME)
    assert fie_payment["reservation"]["breakdown"] is None
    set_profile(client)
    again = next(t for t in client.get("/api/transactions").json() if t["id"] == fie_payment["id"])
    assert again["reservation"]["breakdown"] is None
    assert client.get("/api/tax/summary").json()["breakdown"] is None


def test_split_survives_switching_away_from_the_exact_regime(client, onboarded):
    acme = simulate(client, ACME)
    set_profile(client, regime="fie", rate=4500)
    again = next(t for t in client.get("/api/transactions").json() if t["id"] == acme["id"])
    assert amounts(again["reservation"]["breakdown"]) == {"income_tax": 11040, "social_tax": 16560}
    assert client.get("/api/tax/summary").json()["breakdown"] is None
