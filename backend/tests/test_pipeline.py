"""Task B4: payment pipeline, simulate and answer. Deltas, not seed values."""

import pytest

from helpers import ACME, JOHN, MARI, ONBOARDING, answer, balance, event_types, simulate, tax_jar
from invariants import assert_invariants


def test_acme_reserves_276_eur(client, session, onboarded, events):
    usd, jar = balance(client, "USD"), tax_jar(client)["balance"]
    tx = simulate(client, ACME)
    assert tx["classification"]["label"] == "income"
    assert tx["classification"]["reasons"] == ["company sender", "invoice in reference"]
    reservation = tx["reservation"]
    assert {k: reservation[k] for k in reservation if k not in ("id", "transactionId")} == {
        "sourceAmount": 30000, "sourceCurrency": "USD", "rate": 2000, "fxRate": 0.92,
        "reservedAmount": 27600, "taxCurrency": "EUR", "status": "reserved",
        "breakdown": [{"id": "income_tax", "name": "Income tax", "amount": 11040},
                      {"id": "social_tax", "name": "Social tax", "amount": 16560}],
    }
    assert tx["reservationId"] == reservation["id"]
    assert balance(client, "USD") - usd == 120000
    assert tax_jar(client)["balance"] - jar == 27600
    assert event_types(events) == ["transaction.created", "reservation.created"]
    assert events[-1][1]["transaction"]["reservation"]["reservedAmount"] == 27600
    assert_invariants(session)


def test_mari_is_personal(client, onboarded, events):
    eur, jar = balance(client, "EUR"), tax_jar(client)["balance"]
    tx = simulate(client, MARI)
    assert tx["classification"]["label"] == "personal"
    assert tx["reservation"] is None
    assert balance(client, "EUR") - eur == 2300
    assert tax_jar(client)["balance"] == jar
    assert event_types(events) == ["transaction.created"]


def test_john_is_asked(client, onboarded, events):
    tx = simulate(client, JOHN)
    assert tx["classification"]["label"] == "unknown"
    assert tx["reservation"] is None
    assert event_types(events) == ["transaction.created", "question.asked"]


def test_answer_yes_reserves_and_remembers(client, session, onboarded, events):
    eur = balance(client, "EUR")
    john = simulate(client, JOHN)
    response = answer(client, john["id"], True)
    assert response.status_code == 200
    body = response.json()
    assert body["classification"]["label"] == "income"
    assert body["classification"]["reasons"] == ["you confirmed this was for work"]
    assert body["reservation"]["reservedAmount"] == 8000
    assert balance(client, "EUR") - eur == 32000
    assert event_types(events)[-1] == "reservation.created"

    listed = next(t for t in client.get("/api/transactions").json() if t["id"] == john["id"])
    assert listed["counterparty"]["isKnownClient"] is True

    events.clear()
    again = simulate(client, {"senderName": "John Smith", "amount": 10000, "currency": "EUR", "reference": "logo"})
    assert again["classification"]["label"] == "income"
    assert again["classification"]["reasons"] == ["you marked this payer as a client"]
    assert again["reservation"]["reservedAmount"] == 2000
    assert "question.asked" not in event_types(events)
    assert_invariants(session)


def test_answer_no_remembers_personal(client, onboarded):
    john = simulate(client, JOHN)
    body = answer(client, john["id"], False).json()
    assert body["classification"]["label"] == "personal"
    assert body["reservation"] is None
    again = simulate(client, JOHN)
    assert again["classification"]["label"] == "personal"
    assert again["classification"]["reasons"] == ["you marked this payer as personal"]


def test_answer_twice_moves_money_once(client, session, onboarded, events):
    john = simulate(client, JOHN)
    assert answer(client, john["id"], True).status_code == 200
    jar = tax_jar(client)["balance"]
    events.clear()
    second = answer(client, john["id"], True)
    assert second.status_code == 200
    assert second.json()["reservation"]["reservedAmount"] == 8000
    assert tax_jar(client)["balance"] == jar
    assert events == []
    assert_invariants(session)


def test_answer_unknown_id(client, onboarded):
    response = answer(client, "no-such-id", True)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "transaction_not_found"


def test_answer_before_onboarding(client, events):
    john = simulate(client, JOHN)
    assert event_types(events) == ["transaction.created"]
    response = answer(client, john["id"], True)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "tax_profile_disabled"

    assert client.put("/api/tax-profile", json=ONBOARDING).status_code == 200
    body = answer(client, john["id"], True).json()
    assert body["reservation"]["reservedAmount"] == 8000


def test_payment_before_onboarding(client, session, events):
    usd = balance(client, "USD")
    tx = simulate(client, ACME)
    assert tx["classification"]["label"] == "income"
    assert tx["reservation"] is None
    assert balance(client, "USD") - usd == 150000
    assert event_types(events) == ["transaction.created"]
    assert_invariants(session)


def test_zero_rate_reserves_nothing(client, onboarded, events):
    assert client.put("/api/tax-profile", json={**ONBOARDING, "rate": 0}).status_code == 200
    tx = simulate(client, ACME)
    assert tx["reservation"] is None
    assert event_types(events) == ["transaction.created"]


def test_own_transfer_is_personal(client, onboarded):
    tx = simulate(client, {"senderName": "kadri saar", "amount": 20000, "currency": "GBP", "reference": "invoice"})
    assert tx["classification"]["label"] == "personal"
    assert tx["reservation"] is None


def test_lowercase_currency_is_accepted(client, onboarded):
    tx = simulate(client, {**MARI, "currency": "eur"})
    assert tx["currency"] == "EUR"


@pytest.mark.parametrize(
    "body, code",
    [
        ({"senderName": "Acme Inc.", "amount": 100, "currency": "XYZ", "reference": ""}, "unsupported_currency"),
        ({"senderName": "Acme Inc.", "amount": 0, "currency": "EUR", "reference": ""}, "validation_error"),
        ({"senderName": "Acme Inc.", "amount": -5, "currency": "EUR", "reference": ""}, "validation_error"),
        ({"senderName": "   ", "amount": 100, "currency": "EUR", "reference": ""}, "validation_error"),
        ({"senderName": "Acme Inc.", "amount": 1.5, "currency": "EUR", "reference": ""}, "validation_error"),
        ({"amount": 100, "currency": "EUR"}, "validation_error"),
    ],
)
def test_bad_simulate_input(client, onboarded, events, body, code):
    before = len(client.get("/api/transactions").json())
    response = client.post("/api/simulate/incoming", json=body)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == code
    assert len(client.get("/api/transactions").json()) == before
    assert events == []


def _past_income(session, name, kind, amount, currency, months_ago):
    from datetime import datetime, timedelta, timezone

    from app.engine.classifier import normalize_name
    from app.models import CounterpartyRow, TransactionRow

    key = normalize_name(name)
    if session.get(CounterpartyRow, key) is None:
        session.add(CounterpartyRow(key=key, name=name, kind=kind))
    for m in months_ago:
        session.add(
            TransactionRow(
                direction="in", amount=amount, currency=currency, counterparty_key=key, reference="",
                created_at=datetime.now(timezone.utc) - timedelta(days=30 * m), label="income", confidence=0.99,
            )
        )
    session.commit()


def test_regular_client_needs_no_question(client, session, onboarded):
    _past_income(session, "Oskar Ilves", "person", 60000, "EUR", months_ago=(3, 2, 1))
    tx = simulate(client, {"senderName": "Oskar Ilves", "senderKind": "person", "amount": 60000,
                           "currency": "EUR", "reference": "March"})
    assert tx["classification"]["label"] == "income"
    assert "this payer has paid you before" in tx["classification"]["reasons"]


def test_demo_payers_keep_their_labels_with_history(client, onboarded):
    acme = simulate(client, ACME)
    assert acme["classification"]["label"] == "income"
    assert acme["classification"]["reasons"] == ["company sender", "invoice in reference"]
    assert simulate(client, MARI)["classification"]["label"] == "personal"
    assert simulate(client, JOHN)["classification"]["label"] == "unknown"


def test_repeated_personal_payments_stay_personal(client, onboarded):
    first = simulate(client, MARI)
    second = simulate(client, MARI)
    assert first["classification"]["label"] == "personal"
    assert second["classification"]["label"] == "personal"
    assert "this payer has paid you before" not in first["classification"]["reasons"]


def test_unanswered_payments_never_reserve_on_their_own(client, onboarded):
    for _ in range(4):
        tx = simulate(client, JOHN)
        assert tx["classification"]["label"] == "unknown"
        assert tx["reservation"] is None


def test_payment_in_yen_reserves_into_a_euro_jar(client, session, onboarded):
    """No minor units in JPY: ¥100,000 -> 20% = ¥20,000 -> €122.00."""
    from invariants import assert_invariants

    body = client.post(
        "/api/simulate/incoming",
        json={"senderName": "Sakura Studio K.K.", "amount": 100000, "currency": "JPY", "reference": "INV-7"},
    ).json()
    assert body["reservation"]["sourceAmount"] == 20000
    assert body["reservation"]["reservedAmount"] == 12200
    assert_invariants(session)
