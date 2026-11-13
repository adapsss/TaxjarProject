"""The import: JSON fills empty tables, never overwrites, --replace is explicit and logged (plan Task 3)."""

import json
from pathlib import Path

from sqlalchemy import text

from app import data_load
from app.taxdata.repository import read_tax_data

ENGINE = Path(__file__).resolve().parent.parent / "app" / "engine"


def _clear_tax(session):
    session.execute(text("TRUNCATE tax_country, legal_form, tax_data_load RESTART IDENTITY CASCADE"))


def _rate(session):
    return session.execute(
        text("SELECT default_rate_bp FROM tax_regime WHERE country_code = 'EE' AND id = 'entrepreneur_account'")
    ).scalar_one()


def test_round_trip_equals_the_json(session):
    _clear_tax(session)
    assert data_load.import_dataset(session, "tax") == "imported"
    data = read_tax_data(session)
    assert data.countries == tuple(json.loads((ENGINE / "countries.json").read_text(encoding="utf-8")))
    assert data.legal_forms == tuple(json.loads((ENGINE / "legal_forms.json").read_text(encoding="utf-8"))["forms"])


def test_second_import_keeps_an_edited_rate(session):
    _clear_tax(session)
    data_load.import_dataset(session, "tax")
    session.execute(
        text("UPDATE tax_regime SET default_rate_bp = 2100 WHERE country_code = 'EE' AND id = 'entrepreneur_account'")
    )
    assert data_load.import_dataset(session, "tax") == "already present"
    assert _rate(session) == 2100


def test_replace_restores_and_is_logged(session):
    _clear_tax(session)
    data_load.import_dataset(session, "tax")
    session.execute(
        text("UPDATE tax_regime SET default_rate_bp = 2100 WHERE country_code = 'EE' AND id = 'entrepreneur_account'")
    )
    assert data_load.import_dataset(session, "tax", replace=True) == "replaced"
    assert _rate(session) == 2000
    modes = session.execute(text("SELECT mode FROM tax_data_load WHERE dataset = 'tax' ORDER BY id")).scalars().all()
    assert modes == ["import", "replace"]
    deleted = session.execute(
        text(
            "SELECT count(*) FROM tax_change_log WHERE table_name = 'tax_regime' AND operation = 'DELETE' "
            "AND old_row->>'default_rate_bp' = '2100'"
        )
    ).scalar_one()
    assert deleted == 1


def test_load_row_records_checksum_and_rows(session):
    _clear_tax(session)
    data_load.import_dataset(session, "tax")
    row = session.execute(text("SELECT checksum, rows FROM tax_data_load")).one()
    assert len(row.checksum) == 64
    assert row.rows > 80 + 99 + 496  # countries, regimes, legal forms and their child rows


def test_cli_rejects_an_unknown_dataset(capsys):
    assert data_load.main(["--replace", "nope"]) == 2
    assert "tax" in capsys.readouterr().err
