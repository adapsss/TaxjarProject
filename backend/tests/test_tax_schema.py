"""Tax data schema: constraints that protect the engine from bad hand edits, and the change log (plan Task 2)."""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

REGIME = {
    "country_code": "ZZ", "id": "r1", "position": 0, "name": "Test regime", "applies_to": "", "computable": True,
    "allowance_minor": 0, "income_tax_type": "flat", "income_tax_rate_bp": 2000, "income_tax_base": "",
    "income_tax_brackets": None, "vat_registration_threshold_minor": None, "vat_standard_rate_bp": None,
    "suggested_reserve_rate_bp": 2000, "default_rate_bp": 2000, "reserve_rate_source": "researched",
    "reserve_basis": "", "rule_text": None, "hint": "", "verification": "secondary", "verified_at": "2026-11-13",
    "notes": "",
}


def _insert(session, table, row):
    cols = ", ".join(row)
    vals = ", ".join(f":{k}" for k in row)
    session.execute(text(f"INSERT INTO {table} ({cols}) VALUES ({vals})"), row)


def _valid_rows(session):
    _insert(session, "tax_country", {"code": "ZZ", "name": "Testland", "currency": "EUR", "tax_year_start_month": 1,
                                     "tax_year_start_day": 1, "inherits_from": None, "position": 999})
    _insert(session, "tax_regime", REGIME)
    key = {"country_code": "ZZ", "regime_id": "r1", "position": 0}
    _insert(session, "tax_social_contribution", {**key, "name": "Social", "rate_bp": 1200, "base": "",
                                                 "floor_minor": None, "cap_minor": None, "fixed_annual_minor": None})
    _insert(session, "tax_part", {**key, "part_id": "income_tax", "name": "Income tax", "share_num": 22, "share_den": 55})
    _insert(session, "tax_deadline", {**key, "name": "Monthly", "type": "monthly", "day": 10, "month": None,
                                      "months": None, "is_primary": True})
    session.flush()


@pytest.mark.parametrize(
    "table, column, bad",
    [
        ("tax_regime", "default_rate_bp", 12000),
        ("tax_regime", "suggested_reserve_rate_bp", -1),
        ("tax_social_contribution", "rate_bp", -1),
        ("tax_deadline", "day", 32),
        ("tax_deadline", "month", 13),
        ("tax_regime", "income_tax_type", "magic"),
        ("tax_regime", "verification", "rumour"),
        ("tax_deadline", "type", "weekly"),
        ("tax_part", "share_num", 0),
        ("tax_part", "share_num", 56),
        ("tax_regime", "allowance_minor", -5),
    ],
)
def test_constraint_rejects_bad_edit(session, table, column, bad):
    _valid_rows(session)
    savepoint = session.begin_nested()
    with pytest.raises(IntegrityError):
        session.execute(text(f"UPDATE {table} SET {column} = :bad WHERE country_code = 'ZZ'"), {"bad": bad})
        session.flush()
    savepoint.rollback()


def test_country_cannot_inherit_from_itself(session):
    _valid_rows(session)
    savepoint = session.begin_nested()
    with pytest.raises(IntegrityError):
        session.execute(text("UPDATE tax_country SET inherits_from = 'ZZ' WHERE code = 'ZZ'"))
        session.flush()
    savepoint.rollback()


def test_one_primary_deadline_per_regime(session):
    _valid_rows(session)
    savepoint = session.begin_nested()
    with pytest.raises(IntegrityError):
        _insert(session, "tax_deadline", {"country_code": "ZZ", "regime_id": "r1", "position": 1, "name": "Again",
                                          "type": "annual", "day": 1, "month": 4, "months": None, "is_primary": True})
        session.flush()
    savepoint.rollback()


def test_months_must_be_real_months(session):
    _valid_rows(session)
    savepoint = session.begin_nested()
    with pytest.raises(IntegrityError):
        session.execute(text("UPDATE tax_deadline SET type = 'quarterly', months = ARRAY[3, 6, 13] WHERE country_code = 'ZZ'"))
        session.flush()
    savepoint.rollback()


def test_change_log_records_update(session):
    _valid_rows(session)
    session.execute(text("UPDATE tax_regime SET default_rate_bp = 2100 WHERE country_code = 'ZZ' AND id = 'r1'"))
    row = session.execute(
        text(
            "SELECT operation, old_row->>'default_rate_bp' AS old, new_row->>'default_rate_bp' AS new, "
            "db_user = current_user AS me FROM tax_change_log WHERE table_name = 'tax_regime' AND operation = 'UPDATE'"
        )
    ).one()
    assert (row.operation, row.old, row.new, row.me) == ("UPDATE", "2000", "2100", True)


def test_change_log_records_delete(session):
    _valid_rows(session)
    session.execute(text("DELETE FROM tax_regime WHERE country_code = 'ZZ' AND id = 'r1'"))
    ops = session.execute(
        text("SELECT table_name, operation FROM tax_change_log WHERE operation = 'DELETE' ORDER BY id")
    ).all()
    # The regime and its cascaded children are all recorded.
    assert {t for t, _ in ops} >= {"tax_regime", "tax_social_contribution", "tax_part", "tax_deadline"}


def test_table_definitions_match_the_database(session):
    from app.taxdata import tables

    for table in tables.metadata.sorted_tables:
        in_db = [
            r[0]
            for r in session.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_schema = 'public' AND table_name = :t ORDER BY ordinal_position"
                ),
                {"t": table.name},
            )
        ]
        assert [c.name for c in table.columns] == in_db, table.name


@pytest.mark.parametrize(
    "brackets",
    ['[{}]', '[1]', '[{"upToMinor": null, "rateBp": 20000}]', '[{"upToMinor": -1, "rateBp": 100}]',
     '[{"upToMinor": "a lot", "rateBp": 100}]', '[{"rateBp": 100}]'],
)
def test_malformed_brackets_are_rejected(session, brackets):
    _valid_rows(session)
    savepoint = session.begin_nested()
    with pytest.raises(IntegrityError):
        session.execute(
            text("UPDATE tax_regime SET income_tax_brackets = CAST(:b AS jsonb) WHERE country_code = 'ZZ'"), {"b": brackets}
        )
        session.flush()
    savepoint.rollback()


def test_well_formed_brackets_are_accepted(session):
    _valid_rows(session)
    session.execute(
        text("UPDATE tax_regime SET income_tax_brackets = CAST(:b AS jsonb) WHERE country_code = 'ZZ'"),
        {"b": '[{"upToMinor": 1000000, "rateBp": 0}, {"upToMinor": null, "rateBp": 2000}]'},
    )
    session.flush()
