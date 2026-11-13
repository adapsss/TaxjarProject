"""The app state runs on Postgres (plan Task 1)."""

import subprocess
import threading
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlmodel import Session

from helpers import balance, simulate
from invariants import assert_invariants

APP_DIR = Path(__file__).resolve().parent.parent / "app"
ACME = {"senderName": "Acme Inc.", "amount": 150000, "currency": "USD", "reference": "INV-042"}


def test_runs_on_postgres(session):
    assert session.bind.dialect.name == "postgresql"


def test_amount_above_32_bits(client, onboarded):
    before = balance(client, "EUR")
    simulate(client, {"senderName": "Big Client OÜ", "amount": 3_000_000_000, "currency": "EUR", "reference": "INV-9"})
    # 20% of it goes to the Tax Jar: the balance still grows by more than 2**31 cents.
    assert balance(client, "EUR") - before == 2_400_000_000


def test_money_columns_are_bigint(session):
    rows = session.execute(
        text(
            "select table_name, column_name, data_type from information_schema.columns "
            "where table_schema = 'public' and column_name in "
            "('amount', 'balance', 'source_amount', 'reserved_amount') "
            "and table_name in ('balancerow', 'jarrow', 'transactionrow', 'reservationrow')"
        )
    ).all()
    assert len(rows) == 5, rows  # balance amount, jar balance, transaction amount, two reservation amounts
    assert {r.data_type for r in rows} == {"bigint"}, rows


def test_no_rowid_left():
    found = subprocess.run(
        ["grep", "-rnE", "rowid|PRAGMA|sqlite", str(APP_DIR)], capture_output=True, text=True
    ).stdout
    assert found == "", found


def test_concurrent_payments_keep_invariants(pg_engine):
    """Ten payments for the same currency at once: no lost update on the balance or the Tax Jar."""
    from app import db
    from app.events import EventBus, get_bus
    from app.main import create_app
    from app.models import PROFILE_ID, ProfileRow

    with Session(pg_engine) as s:
        db.reset_to_seed(s)
        profile = s.get(ProfileRow, PROFILE_ID)
        profile.country, profile.regime, profile.rate_bp = "EE", "entrepreneur_account", 2000
        profile.tax_currency, profile.enabled = "EUR", True
        s.add(profile)
        s.commit()
        jar_before = s.execute(text("select balance from jarrow where id = 'tax'")).scalar_one()

    def real_session():
        with Session(pg_engine) as s:
            yield s

    app = create_app()
    bus = EventBus()
    app.dependency_overrides[db.get_session] = real_session
    app.dependency_overrides[get_bus] = lambda: bus
    client = TestClient(app)
    errors = []

    def pay():
        r = client.post("/api/simulate/incoming", json=ACME)
        if r.status_code != 200:
            errors.append(r.text)

    threads = [threading.Thread(target=pay) for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert errors == []
    with Session(pg_engine) as s:
        jar_after = s.execute(text("select balance from jarrow where id = 'tax'")).scalar_one()
        assert jar_after - jar_before == 10 * 27600
        assert_invariants(s)
        db.reset_to_seed(s)
