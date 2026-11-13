"""Task B5: undo a tax reservation."""

from helpers import ACME, JOHN, MARI, answer, balance, simulate, tax_jar, undo
from invariants import assert_invariants


def test_undo_returns_money(client, session, onboarded, events):
    usd, jar = balance(client, "USD"), tax_jar(client)["balance"]
    acme = simulate(client, ACME)
    response = undo(client, acme["id"])
    assert response.status_code == 200
    body = response.json()
    assert body["reservation"]["status"] == "undone"
    assert body["classification"]["label"] == "personal"
    assert body["classification"]["reasons"] == ["you said this wasn't income"]
    assert balance(client, "USD") - usd == 150000
    assert tax_jar(client)["balance"] == jar
    assert events[-1][0] == "reservation.undone"
    assert_invariants(session)


def test_undo_twice_moves_money_once(client, session, onboarded, events):
    acme = simulate(client, ACME)
    assert undo(client, acme["id"]).status_code == 200
    usd = balance(client, "USD")
    events.clear()
    second = undo(client, acme["id"])
    assert second.status_code == 200
    assert second.json()["reservation"]["status"] == "undone"
    assert balance(client, "USD") == usd
    assert events == []
    assert_invariants(session)


def test_undo_without_reservation(client, onboarded):
    mari = simulate(client, MARI)
    response = undo(client, mari["id"])
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "no_reservation"


def test_undo_unknown_id(client):
    response = undo(client, "no-such-id")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "transaction_not_found"


def test_undo_does_not_forget_client(client, onboarded):
    john = simulate(client, JOHN)
    answer(client, john["id"], True)
    assert undo(client, john["id"]).status_code == 200
    again = simulate(client, JOHN)
    assert again["classification"]["label"] == "income"


def test_answer_after_undo_moves_nothing(client, session, onboarded):
    john = simulate(client, JOHN)
    answer(client, john["id"], True)
    undo(client, john["id"])
    jar = tax_jar(client)["balance"]
    assert answer(client, john["id"], True).status_code == 200
    assert tax_jar(client)["balance"] == jar
    assert_invariants(session)
