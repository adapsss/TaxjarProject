"""The engine reads tax data from Postgres and refreshes it on a timer (plan Task 4)."""

import subprocess
from pathlib import Path

import pytest
from sqlalchemy import text

from app.engine import data
from helpers import ACME, simulate

ENGINE_DIR = Path(__file__).resolve().parent.parent / "app" / "engine"


def _ee_entrepreneur_rate(client):
    countries = {c["code"]: c for c in client.get("/api/tax/countries").json()}
    return next(r["defaultRate"] for r in countries["EE"]["regimes"] if r["id"] == "entrepreneur_account")


def test_engine_opens_no_files():
    found = subprocess.run(
        ["grep", "-rnE", r"open\(|with_name\(|json\.load", str(ENGINE_DIR), "--include=*.py"],
        capture_output=True, text=True,
    ).stdout
    assert found == "", found


def test_sql_edit_shows_after_refresh(client, session, fake_clock):
    assert _ee_entrepreneur_rate(client) == 2000
    session.execute(
        text("UPDATE tax_regime SET default_rate_bp = 2100 WHERE country_code = 'EE' AND id = 'entrepreneur_account'")
    )
    fake_clock.advance(59)
    assert _ee_entrepreneur_rate(client) == 2000  # still cached
    fake_clock.advance(2)
    assert _ee_entrepreneur_rate(client) == 2100


def test_deleted_regime_does_not_break_transactions(client, session, onboarded, fake_clock):
    acme = simulate(client, ACME)
    assert acme["reservation"]["breakdown"] is not None
    session.execute(text("DELETE FROM tax_regime WHERE country_code = 'EE' AND id = 'entrepreneur_account'"))
    fake_clock.advance(61)
    response = client.get("/api/transactions")
    assert response.status_code == 200
    again = next(t for t in response.json() if t["id"] == acme["id"])
    assert again["reservation"]["breakdown"] is None


def test_not_installed_is_a_clear_error(monkeypatch):
    monkeypatch.setattr(data, "_reader", None)
    monkeypatch.setattr(data, "_data", None)
    with pytest.raises(RuntimeError, match="tax data not installed"):
        data.current()
