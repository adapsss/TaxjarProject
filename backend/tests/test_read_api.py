"""Task B2: read endpoints, tax profile, error format."""

from app.models import TAX_JAR_ID, JarRow
from helpers import ONBOARDING, tax_jar


def test_account_matches_seed(client):
    account = client.get("/api/account").json()
    assert account["owner"] == "Kadri Saar"
    assert len(account["balances"]) == 3
    assert tax_jar(client)["balance"] == 0


def test_transactions_newest_first(client):
    transactions = client.get("/api/transactions").json()
    assert len(transactions) >= 10
    created = [t["createdAt"] for t in transactions]
    assert created == sorted(created, reverse=True)
    assert all(t["classification"]["label"] in ("income", "personal", "unknown") for t in transactions)


def test_timestamps_carry_utc(client):
    created_at = client.get("/api/transactions").json()[0]["createdAt"]
    assert created_at.endswith("Z") or created_at.endswith("+00:00")


def test_countries(client):
    countries = {c["code"]: c for c in client.get("/api/tax/countries").json()}
    assert {r["id"] for r in countries["EE"]["regimes"]} == {"entrepreneur_account", "fie"}
    regime = countries["EE"]["regimes"][0]
    assert set(regime) == {"id", "name", "defaultRate", "hint", "breakdownRule"}


def test_put_profile_enables(client):
    response = client.put("/api/tax-profile", json=ONBOARDING)
    assert response.status_code == 200
    assert client.get("/api/tax-profile").json() == ONBOARDING


def test_rate_out_of_range(client):
    for rate in (10001, -1):
        response = client.put("/api/tax-profile", json={**ONBOARDING, "rate": rate})
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "validation_error"


def test_unknown_regime(client):
    response = client.put("/api/tax-profile", json={**ONBOARDING, "regime": "nope"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "unknown_regime"


def test_unsupported_tax_currency(client):
    response = client.put("/api/tax-profile", json={**ONBOARDING, "taxCurrency": "JPY"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "unsupported_currency"


def test_tax_currency_locked_when_jar_has_money(client, session):
    session.get(JarRow, TAX_JAR_ID).balance = 100
    session.commit()
    response = client.put("/api/tax-profile", json={**ONBOARDING, "taxCurrency": "USD"})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "tax_jar_not_empty"


def test_tax_currency_change_moves_empty_jar(client):
    assert client.put("/api/tax-profile", json={**ONBOARDING, "taxCurrency": "USD"}).status_code == 200
    assert tax_jar(client)["currency"] == "USD"


def test_missing_field_uses_error_format(client):
    body = {k: v for k, v in ONBOARDING.items() if k != "rate"}
    response = client.put("/api/tax-profile", json=body)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert "rate" in response.json()["error"]["message"]


def test_unknown_route_uses_error_format(client):
    response = client.get("/api/nope")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_reset_restores_seed(client):
    client.put("/api/tax-profile", json=ONBOARDING)
    response = client.post("/api/demo/reset")
    assert response.status_code == 200
    assert response.json()["owner"] == "Kadri Saar"
    assert client.get("/api/tax-profile").json()["enabled"] is False


def test_estonian_names_keep_their_accents(client):
    countries = {c["code"]: c for c in client.get("/api/tax/countries").json()}
    names = " | ".join(r["name"] for r in countries["EE"]["regimes"])
    assert "ettevõtluskonto" in names
