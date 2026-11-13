"""Task B6: pay tax from the Tax Jar."""

from helpers import ACME, balance, event_types, simulate, tax_jar, undo
from invariants import assert_invariants


def test_pay_empties_the_jar(client, session, onboarded, events):
    simulate(client, ACME)
    usd = balance(client, "USD")
    events.clear()
    response = client.post("/api/tax/pay")
    assert response.status_code == 200
    body = response.json()
    assert body["paidAmount"] == 27600
    assert body["currency"] == "EUR"
    assert body["transaction"]["direction"] == "out"
    assert body["transaction"]["counterparty"]["name"] == "Tax authority (demo)"
    assert body["transaction"]["reference"] == "Tax payment"
    assert body["transaction"]["classification"]["label"] == "personal"
    assert tax_jar(client)["balance"] == 0
    assert balance(client, "USD") == usd
    assert event_types(events) == ["transaction.created"]
    assert_invariants(session)


def test_pay_with_empty_jar(client, onboarded):
    response = client.post("/api/tax/pay")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "nothing_to_pay"


def test_pay_twice(client, onboarded):
    simulate(client, ACME)
    assert client.post("/api/tax/pay").status_code == 200
    second = client.post("/api/tax/pay")
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "nothing_to_pay"


def test_undo_after_paid(client, session, onboarded):
    acme = simulate(client, ACME)
    client.post("/api/tax/pay")
    response = undo(client, acme["id"])
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "reservation_paid"
    assert tax_jar(client)["balance"] == 0
    assert_invariants(session)
