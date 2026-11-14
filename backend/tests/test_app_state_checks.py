"""The app-state tables check their own values (migration 0005), and the models match the migrations."""

import pytest
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError
from sqlmodel import SQLModel

from app import models  # noqa: F401 - registers the tables on SQLModel.metadata
from helpers import ACME, simulate

APP_TABLES = ("profilerow", "balancerow", "jarrow", "counterpartyrow", "transactionrow", "reservationrow")


@pytest.mark.parametrize(
    "statement",
    [
        "UPDATE balancerow SET amount = -1 WHERE currency = 'EUR'",
        "UPDATE jarrow SET balance = -1 WHERE id = 'tax'",
        "UPDATE jarrow SET type = 'piggy' WHERE id = 'tax'",
        "UPDATE profilerow SET rate_bp = 20000",
        "UPDATE profilerow SET rate_bp = -5",
        "UPDATE transactionrow SET amount = 0",
        "UPDATE transactionrow SET direction = 'sideways'",
        "UPDATE transactionrow SET label = 'maybe'",
        "UPDATE transactionrow SET confidence = 1.5",
        "UPDATE counterpartyrow SET kind = 'robot'",
        "UPDATE counterpartyrow SET status = 'friend'",
    ],
)
def test_the_database_refuses_impossible_values(session, statement):
    savepoint = session.begin_nested()
    with pytest.raises(IntegrityError):
        session.execute(text(statement))
    savepoint.rollback()


@pytest.mark.parametrize(
    "change",
    ["source_amount = 0", "reserved_amount = -1", "rate_bp = 10001", "fx_rate = 0", "status = 'lost'"],
)
def test_the_database_refuses_impossible_reservations(client, session, onboarded, change):
    simulate(client, ACME)
    savepoint = session.begin_nested()
    with pytest.raises(IntegrityError):
        session.execute(text(f"UPDATE reservationrow SET {change}"))
    savepoint.rollback()


def _sql_type(column_type, session) -> str:
    """The type as Postgres spells it; a model's Float is stored as double precision."""
    spelled = column_type.compile(dialect=session.bind.dialect)
    return {"FLOAT": "DOUBLE PRECISION"}.get(spelled, spelled)


def test_app_state_models_match_the_database(session):
    """The migrations are written by hand: this is what notices a model and a migration drifting apart."""
    inspector = inspect(session.connection())
    for name in APP_TABLES:
        table = SQLModel.metadata.tables[name]
        in_db = {c["name"]: c for c in inspector.get_columns(name)}
        assert set(in_db) == {c.name for c in table.columns}, name
        for column in table.columns:
            found = in_db[column.name]
            assert found["nullable"] == column.nullable, f"{name}.{column.name} nullable"
            assert _sql_type(found["type"], session) == _sql_type(column.type, session), f"{name}.{column.name} type"
        model_checks = {c.name for c in table.constraints if c.__class__.__name__ == "CheckConstraint"}
        assert {c["name"] for c in inspector.get_check_constraints(name)} == model_checks, name
        assert model_checks, name  # every app-state table has at least one


def test_model_checks_say_what_the_migration_says(session):
    from importlib import import_module

    migration = import_module("migrations.versions.0005_app_state_checks")
    in_models = {
        (table.name, c.name, str(c.sqltext))
        for table in SQLModel.metadata.tables.values()
        for c in table.constraints
        if c.__class__.__name__ == "CheckConstraint"
    }
    assert in_models == set(migration.CHECKS)
