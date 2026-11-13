"""Shared test fixtures. Every test runs on Postgres (TEST_DATABASE_URL).

    pg_engine  the test database, migrated once per run (schema public dropped and rebuilt)
    session    a session inside a transaction that is rolled back after the test; code under
               test may commit (commits become savepoints), and nothing leaks into the next test
    client     TestClient whose routes use that same session and a fresh event bus
    onboarded  profile set to EE / entrepreneur_account / 2000 / EUR / enabled
    events     list of (type, data) for every publish made during the test

Start the database first:  docker compose up -d db   (it listens on 127.0.0.1:5433)
"""

import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlmodel import Session

from app.db import get_session, reset_to_seed
from app.events import EventBus, get_bus
from app.main import create_app
from app.models import PROFILE_ID, ProfileRow

BACKEND_DIR = Path(__file__).resolve().parent.parent
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://taxjar:taxjar@localhost:5433/taxjar_test"
)


def migrate(connection) -> None:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.attributes["connection"] = connection
    command.upgrade(config, "head")


@pytest.fixture(scope="session")
def pg_engine():
    engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
    try:
        with engine.begin() as connection:
            connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
            connection.execute(text("CREATE SCHEMA public"))
            migrate(connection)
    except OperationalError as exc:
        pytest.exit(f"Start Postgres: docker compose up -d db (DB_PORT=5433). {exc.orig}", returncode=2)
    yield engine
    engine.dispose()


@pytest.fixture
def session(pg_engine):
    connection = pg_engine.connect()
    outer = connection.begin()
    with Session(bind=connection, join_transaction_mode="create_savepoint") as session:
        reset_to_seed(session)
        yield session
    outer.rollback()
    connection.close()


@pytest.fixture
def client(session):
    app = create_app()
    bus = EventBus()
    app.state.test_bus = bus
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[get_bus] = lambda: bus
    # Not used as a context manager, so startup does not run against the real database.
    return TestClient(app)


@pytest.fixture
def onboarded(session):
    profile = session.get(ProfileRow, PROFILE_ID)
    profile.country = "EE"
    profile.regime = "entrepreneur_account"
    profile.rate_bp = 2000
    profile.tax_currency = "EUR"
    profile.enabled = True
    session.add(profile)
    session.commit()
    return profile


@pytest.fixture
def events(client, monkeypatch):
    bus = client.app.state.test_bus
    recorded = []
    deliver = bus.publish

    def record_and_deliver(type: str, data: dict) -> None:
        recorded.append((type, data))
        deliver(type, data)

    monkeypatch.setattr(bus, "publish", record_and_deliver)
    return recorded
