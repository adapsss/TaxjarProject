"""Catch-up: set tax aside for income that arrived before the Tax Jar was set up."""

from helpers import ACME, JOHN, balance, simulate, tax_jar, undo
from invariants import assert_invariants

SINCE = {"since": "2026-01-01"}  # the seed's income is dated Aug-Nov 2026

# Seed income since 1 Jan 2026, 20% each, converted to EUR (USD 0.92, GBP 1.15):
# Kuusiku €1,800 -> €360 · Northbeam $950 -> $190 = €174.80 · Harbourline £420 -> £84 = €96.60
# Talvik €1,500 -> €300 · Northbeam $600 -> $120 = €110.40 · Harbourline £300 -> £60 = €69.00
SEED_TAX = 36000 + 17480 + 9660 + 30000 + 11040 + 6900
SEED_INCOME = 180000 + 87400 + 48300 + 150000 + 55200 + 34500


def test_preview_lists_earlier_income_without_moving_money(client, session, onboarded):
    jar = tax_jar(client)["balance"]
    body = client.get("/api/tax/catch-up", params=SINCE).json()
    assert body == {"since": "2026-01-01", "count": 6, "income": SEED_INCOME, "reserved": SEED_TAX, "taxCurrency": "EUR"}
    assert tax_jar(client)["balance"] == jar


def test_catch_up_reserves_each_payment_once(client, session, onboarded, events):
    eur, usd = balance(client, "EUR"), balance(client, "USD")
    response = client.post("/api/tax/catch-up", json=SINCE)
    assert response.status_code == 200
    assert response.json()["count"] == 6
    assert response.json()["reserved"] == SEED_TAX
    assert tax_jar(client)["balance"] == SEED_TAX
    assert eur - balance(client, "EUR") == 36000 + 30000
    assert usd - balance(client, "USD") == 19000 + 12000
    assert [e[0] for e in events] == ["reservation.created"] * 6
    assert client.get("/api/tax/summary").json()["totalReserved"] == SEED_TAX
    assert_invariants(session)

    # A second call finds nothing left and moves nothing.
    again = client.post("/api/tax/catch-up", json=SINCE).json()
    assert again["count"] == 0 and again["reserved"] == 0
    assert tax_jar(client)["balance"] == SEED_TAX
    assert client.get("/api/tax/catch-up", params=SINCE).json()["count"] == 0


def test_since_limits_the_window(client, session, onboarded):
    body = client.get("/api/tax/catch-up", params={"since": "2026-10-01"}).json()
    assert body["count"] == 3  # Talvik, Northbeam (Oct), Harbourline (Nov)


def test_live_and_undone_payments_are_never_caught_up(client, session, onboarded):
    acme = simulate(client, ACME)  # reserved live
    simulate(client, JOHN)  # unknown: waits for the user's answer
    undo(client, acme["id"])  # now personal
    assert client.get("/api/tax/catch-up", params=SINCE).json()["count"] == 6
    client.post("/api/tax/catch-up", json=SINCE)
    assert client.get(f"/api/transactions").json()[0]["reservation"] is None  # John still has no reservation
    assert_invariants(session)


def test_needs_a_tax_profile(client, session):
    assert client.get("/api/tax/catch-up", params=SINCE).json()["count"] == 0
    response = client.post("/api/tax/catch-up", json=SINCE)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "tax_profile_disabled"
