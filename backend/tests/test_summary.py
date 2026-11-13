"""Task C4: tax summary."""

from datetime import date, datetime, timezone

from app.summary import DISCLAIMER, build_summary
from helpers import ACME, JOHN, answer, simulate, undo


def test_summary_after_acme_and_john(client, onboarded):
    simulate(client, ACME)
    john = simulate(client, JOHN)
    answer(client, john["id"], True)
    summary = client.get("/api/tax/summary").json()
    assert summary["totalReserved"] == 35600
    assert summary["taxCurrency"] == "EUR"
    assert summary["estimatedDue"] == 35600
    assert summary["totalPaid"] == 0
    assert summary["byMonth"] == [{"month": datetime.now(timezone.utc).strftime("%Y-%m"), "reserved": 35600}]


def test_paid_moves_from_reserved_to_paid(client, onboarded):
    simulate(client, ACME)
    client.post("/api/tax/pay")
    summary = client.get("/api/tax/summary").json()
    assert (summary["totalReserved"], summary["totalPaid"], summary["estimatedDue"]) == (0, 27600, 0)
    assert summary["byMonth"][0]["reserved"] == 27600


def test_undone_is_excluded(client, onboarded):
    acme = simulate(client, ACME)
    undo(client, acme["id"])
    summary = client.get("/api/tax/summary").json()
    assert summary["totalReserved"] == 0
    assert summary["byMonth"] == []


def test_empty_summary(client):
    summary = client.get("/api/tax/summary").json()
    assert (summary["totalReserved"], summary["totalPaid"], summary["byMonth"]) == (0, 0, [])
    assert summary["disclaimer"] == DISCLAIMER == "An estimate for setting money aside, not tax advice."


def test_deadline_follows_regime(session, onboarded):
    assert build_summary(session, date(2026, 11, 13)).next_deadline == date(2026, 12, 10)
