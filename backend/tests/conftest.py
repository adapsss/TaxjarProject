"""Shared test fixtures. Every test runs on Postgres (TEST_DATABASE_URL).

    pg_engine  the test database, migrated once per run (schema public dropped and rebuilt)
    session    a session inside a transaction that is rolled back after the test; code under
               test may commit (commits become savepoints), and nothing leaks into the next test
    client     TestClient whose routes use that same session and a fresh event bus
    onboarded  profile set to EE / entrepreneur_account / 2000 / EUR / enabled
    fake_clock the tax data's refresh clock, advanced by hand (60 s refresh interval)

The tax data is imported once per run; the engine reads it through the current test's session,
so a row a test changes is what the engine sees after the next refresh.
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

from app import data_load
from app.db import get_session, reset_to_seed
from app.engine import data as tax_data
from app.taxdata.repository import read_tax_data
from app.events import EventBus, get_bus
from app.main import create_app
from app.models import PROFILE_ID, ProfileRow

# The demo routes (reset, simulator, scenarios) are off unless asked for; most tests drive them.
os.environ.setdefault("DEMO_MODE", "true")

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
    with Session(engine) as session:
        for dataset in data_load.DATASETS:
            data_load.import_dataset(session, dataset)
    yield engine
    engine.dispose()


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


_active = {"session": None}


@pytest.fixture(scope="session", autouse=True)
def _tax_data_from_postgres(pg_engine):
    """Engine reads come from the running test's session, or from a fresh one outside a test session."""

    def read():
        if _active["session"] is not None:
            return read_tax_data(_active["session"])
        with Session(pg_engine) as s:
            return read_tax_data(s)

    tax_data.install(read, 60)
    yield
    tax_data.clear()


@pytest.fixture
def fake_clock():
    clock = FakeClock()
    tax_data.install(tax_data._reader, 60, clock)
    yield clock
    tax_data.install(tax_data._reader, 60)


@pytest.fixture
def session(pg_engine):
    connection = pg_engine.connect()
    outer = connection.begin()
    with Session(bind=connection, join_transaction_mode="create_savepoint") as session:
        reset_to_seed(session)
        _active["session"] = session
        tax_data.clear()
        yield session
        _active["session"] = None
        tax_data.clear()
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
