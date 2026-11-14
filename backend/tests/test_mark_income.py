"""Marking a payment as work income after the fact: the reverse of undo."""

from helpers import ACME, JOHN, MARI, answer, balance, simulate, tax_jar, undo
from invariants import assert_invariants


def mark(client, tx_id: str):
    return client.post(f"/api/transactions/{tx_id}/mark-income")


def test_personal_payment_becomes_income_and_tax_is_set_aside(client, session, onboarded, events):
    mari = simulate(client, MARI)  # a friend's €23: personal, nothing set aside
    assert mari["classification"]["label"] == "personal"
    eur, jar = balance(client, "EUR"), tax_jar(client)["balance"]
    events.clear()

    response = mark(client, mari["id"])
    assert response.status_code == 200
    body = response.json()
    assert body["classification"]["label"] == "income"
    assert body["classification"]["reasons"] == ["you said this was for work"]
    assert body["reservation"]["status"] == "reserved"
    assert body["reservation"]["reservedAmount"] == 460  # 20% of €23.00
    assert balance(client, "EUR") == eur - 460
    assert tax_jar(client)["balance"] == jar + 460
    assert events[-1][0] == "reservation.created"
    assert_invariants(session)


def test_undone_payment_can_be_marked_income_again(client, session, onboarded):
    acme = simulate(client, ACME)
    usd, jar = balance(client, "USD"), tax_jar(client)["balance"]
    undo(client, acme["id"])
    assert tax_jar(client)["balance"] < jar

    response = mark(client, acme["id"])
    assert response.status_code == 200
    body = response.json()
    assert body["classification"]["label"] == "income"
    assert body["reservation"]["status"] == "reserved"
    assert body["reservation"]["id"] == acme["reservation"]["id"]  # the same row, brought back
    assert balance(client, "USD") == usd
    assert tax_jar(client)["balance"] == jar
    assert_invariants(session)


def test_flip_back_and_forth_keeps_money_whole(client, session, onboarded):
    mari = simulate(client, MARI)
    eur, jar = balance(client, "EUR"), tax_jar(client)["balance"]
    for _ in range(3):
        assert mark(client, mari["id"]).status_code == 200
        assert undo(client, mari["id"]).status_code == 200
    assert balance(client, "EUR") == eur
    assert tax_jar(client)["balance"] == jar
    assert_invariants(session)


def test_marking_income_twice_moves_money_once(client, session, onboarded, events):
    mari = simulate(client, MARI)
    assert mark(client, mari["id"]).status_code == 200
    eur, jar = balance(client, "EUR"), tax_jar(client)["balance"]
    events.clear()
    again = mark(client, mari["id"])
    assert again.status_code == 200
    assert again.json()["reservation"]["status"] == "reserved"
    assert balance(client, "EUR") == eur
    assert tax_jar(client)["balance"] == jar
    assert events == []
    assert_invariants(session)


def test_uses_the_current_rate_when_it_changed_after_the_undo(client, session, onboarded):
    mari = simulate(client, MARI)
    mark(client, mari["id"])
    undo(client, mari["id"])
    client.put("/api/tax-profile", json={**onboarded_profile(client), "rate": 3000})
    body = mark(client, mari["id"]).json()
    assert body["reservation"]["rate"] == 3000
    assert body["reservation"]["reservedAmount"] == 690
    assert_invariants(session)


def test_income_whose_tax_is_paid_is_left_alone(client, onboarded):
    acme = simulate(client, ACME)
    assert client.post("/api/tax/pay").status_code == 200
    response = mark(client, acme["id"])
    assert response.status_code == 200
    assert response.json()["reservation"]["status"] == "paid"


def test_unknown_payment_is_answered_as_work(client, session, onboarded):
    john = simulate(client, JOHN)
    assert john["classification"]["label"] == "unknown"
    body = mark(client, john["id"]).json()
    assert body["classification"]["label"] == "income"
    assert body["reservation"]["status"] == "reserved"
    assert body["counterparty"]["isKnownClient"] is True  # same as answering yes
    assert_invariants(session)


def test_does_not_change_what_we_remember_about_the_payer(client, onboarded):
    mari = simulate(client, MARI)
    mark(client, mari["id"])
    again = simulate(client, MARI)
    assert again["classification"]["label"] == "personal"


def test_needs_an_enabled_tax_jar(client):
    mari = simulate(client, MARI)
    response = mark(client, mari["id"])
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "tax_profile_disabled"


def test_unknown_id(client, onboarded):
    response = mark(client, "no-such-id")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "transaction_not_found"


def test_outgoing_payment_cannot_be_income(client, onboarded):
    acme = simulate(client, ACME)
    client.post("/api/tax/pay")
    outgoing = next(t for t in client.get("/api/transactions").json() if t["direction"] == "out")
    assert outgoing["id"] != acme["id"]
    response = mark(client, outgoing["id"])
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "not_incoming"


def test_nothing_changes_when_the_money_is_already_spent(client, session, onboarded):
    mari = simulate(client, MARI)
    # Empty the EUR account so there is nothing to set aside from.
    from sqlmodel import select

    from app.models import BalanceRow

    row = session.exec(select(BalanceRow).where(BalanceRow.currency == "EUR")).one()
    row.amount = 0
    session.add(row)
    session.commit()

    response = mark(client, mari["id"])
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "insufficient_balance"
    unchanged = next(t for t in client.get("/api/transactions").json() if t["id"] == mari["id"])
    assert unchanged["classification"]["label"] == "personal"
    assert unchanged["reservation"] is None


def onboarded_profile(client) -> dict:
    return client.get("/api/tax-profile").json()
