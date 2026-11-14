"""Demo seed and scenarios live in Postgres; DEMO_MODE hides the demo routes (plan Task 5)."""

from sqlalchemy import text
from sqlmodel import Session, delete

from app import data_load, db
from app.models import BalanceRow, CounterpartyRow, JarRow, ProfileRow, ReservationRow, TransactionRow
from helpers import ACME


def test_scenarios_come_from_the_database(client, session):
    first = client.get("/api/demo/scenarios").json()
    assert len(first) == 8
    assert (first[0]["id"], first[0]["senderName"], first[0]["amount"]) == ("acme", "Acme Inc.", 150000)
    session.execute(text("UPDATE demo_scenario SET label = 'Edited in SQL' WHERE id = 'acme'"))
    assert client.get("/api/demo/scenarios").json()[0]["label"] == "Edited in SQL"


def test_reset_uses_the_database_seed(client, session):
    session.execute(
        text("UPDATE demo_seed SET data = jsonb_set(data, '{balances,0,amount}', '100000') WHERE id = 1")
    )
    account = client.post("/api/demo/reset").json()
    assert next(b["amount"] for b in account["balances"] if b["currency"] == "EUR") == 100000


def test_demo_mode_off_hides_demo_routes(client, monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "false")
    for method, path, body in (
        ("post", "/api/demo/reset", None),
        ("post", "/api/simulate/incoming", ACME),
        ("get", "/api/demo/scenarios", None),
    ):
        response = getattr(client, method)(path, json=body) if body else getattr(client, method)(path)
        assert response.status_code == 404, path
        assert response.json()["error"]["code"] == "not_found", path
    assert client.get("/api/account").status_code == 200


def test_fresh_database_gets_the_seed(session):
    for table in (ReservationRow, TransactionRow, CounterpartyRow, JarRow, BalanceRow, ProfileRow):
        session.exec(delete(table))
    session.commit()
    assert db.seed_if_empty(session) is True
    assert session.get(ProfileRow, 1).owner_name == "Kadri Saar"


def test_demo_datasets_import_once(session):
    session.execute(text("TRUNCATE demo_seed, demo_scenario"))
    assert data_load.import_dataset(session, "demo_seed") == "imported"
    assert data_load.import_dataset(session, "demo_scenarios") == "imported"
    assert data_load.import_dataset(session, "demo_seed") == "already present"
    assert data_load.import_dataset(session, "demo_scenarios") == "already present"


def test_demo_routes_are_off_unless_asked_for(client, monkeypatch):
    monkeypatch.delenv("DEMO_MODE")
    assert client.post("/api/demo/reset").status_code == 404
    assert client.post("/api/simulate/incoming", json={"senderName": "Acme Inc.", "amount": 150000, "currency": "USD"}).status_code == 404
    assert client.get("/api/demo/scenarios").status_code == 404
    assert client.get("/api/account").status_code == 200
