"""Task C3: the money invariants must hold after any sequence of user actions.

Random but reproducible sequences of payments, answers, undos, tax payments and
profile changes; the invariants are checked after every single step.
"""
import random

import pytest

from helpers import answer, simulate, undo
from invariants import assert_invariants

SENDERS = [
    ("Acme Inc.", None), ("Nordwind GmbH", None), ("Brightside Ltd", None), ("John Smith", None),
    ("Mari Tamm", "person"), ("Liis Kask", "person"), ("Kadri Saar", None), ("Peeter Paju", "person"),
]
REFERENCES = ["INV-042", "website", "", "thanks", "RF18 5390 0754 7034", "order #123"]
CURRENCIES = ["EUR", "USD", "GBP"]
AMOUNTS = [1, 2, 3, 49, 99, 101, 2300, 40000, 150000, 999999]
RATES = [0, 1, 50, 2000, 2200, 2600, 4500, 9999, 10000]


def put_profile(client, rng):
    body = {"country": "EE", "regime": rng.choice(["entrepreneur_account", "fie"]), "rate": rng.choice(RATES),
            "taxCurrency": rng.choice(CURRENCIES), "enabled": rng.random() > 0.15}
    return client.put("/api/tax-profile", json=body)


@pytest.mark.parametrize("seed", range(40))
def test_invariants_hold_after_random_actions(client, session, onboarded, seed):
    rng = random.Random(seed)
    transactions = []
    for _ in range(60):
        action = rng.choice(["pay", "pay", "pay", "pay", "answer", "answer", "undo", "undo", "tax", "profile"])
        if action == "pay":
            name, kind = rng.choice(SENDERS)
            body = {"senderName": name, "amount": rng.choice(AMOUNTS), "currency": rng.choice(CURRENCIES),
                    "reference": rng.choice(REFERENCES)}
            if kind:
                body["senderKind"] = kind
            transactions.append(simulate(client, body)["id"])
        elif action == "answer" and transactions:
            assert answer(client, rng.choice(transactions), rng.random() > 0.4).status_code in (200, 409)
        elif action == "undo" and transactions:
            assert undo(client, rng.choice(transactions)).status_code in (200, 409)
        elif action == "tax":
            assert client.post("/api/tax/pay").status_code in (200, 409)
        elif action == "profile":
            assert put_profile(client, rng).status_code in (200, 409, 422)
        assert_invariants(session)
        summary = client.get("/api/tax/summary").json()
        if summary["breakdown"] is not None:
            assert sum(part["amount"] for part in summary["breakdown"]) == summary["totalReserved"]


def test_repeating_every_action_moves_no_extra_money(client, session, onboarded):
    acme = simulate(client, {"senderName": "Acme Inc.", "amount": 150000, "currency": "USD", "reference": "INV-042"})
    john = simulate(client, {"senderName": "John Smith", "amount": 40000, "currency": "EUR", "reference": "website"})
    for _ in range(3):
        answer(client, john["id"], True)
        assert_invariants(session)
    for _ in range(3):
        undo(client, acme["id"])
        assert_invariants(session)
    for _ in range(3):
        client.post("/api/tax/pay")
        assert_invariants(session)
    assert undo(client, john["id"]).status_code == 409


@pytest.mark.parametrize("body", [
    {"senderName": "Acme Inc.", "amount": 10 ** 30, "currency": "USD"},
    {"senderName": "Acme Inc.", "amount": 2 ** 63, "currency": "USD"},
    {"senderName": "x" * 100000, "amount": 100, "currency": "USD"},
    {"senderName": "Acme Inc.", "amount": 100, "currency": "usd", "reference": None},
    {"senderName": "Acme Inc.", "amount": 1.5, "currency": "USD"},
    {"senderName": "Acme Inc.", "amount": 100, "currency": "JPY"},
])
def test_hostile_payments_never_break_the_books(client, session, onboarded, body):
    response = client.post("/api/simulate/incoming", json=body)
    assert response.status_code in (200, 422), response.text
    assert_invariants(session)
    assert client.get("/api/account").status_code == 200
