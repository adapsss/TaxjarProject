"""Task C3: money invariants across a mixed run of payments."""

from helpers import ACME, JOHN, MARI, answer, simulate, undo
from invariants import assert_invariants


def test_invariants_after_mixed_payments(client, session, onboarded):
    simulate(client, ACME)
    simulate(client, MARI)
    john = simulate(client, JOHN)
    answer(client, john["id"], True)
    simulate(client, {"senderName": "Brightside Ltd", "amount": 90000, "currency": "GBP", "reference": "consulting March"})
    assert_invariants(session)


def test_invariants_after_undo_and_pay(client, session, onboarded):
    acme = simulate(client, ACME)
    john = simulate(client, JOHN)
    answer(client, john["id"], True)
    undo(client, acme["id"])
    client.post("/api/tax/pay")
    assert_invariants(session)


def test_invariants_hold_on_fresh_seed(session):
    assert_invariants(session)
