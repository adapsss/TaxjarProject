"""Shared test fixtures. Owned by Backend 1 (replaces the Task S0 `client` fixture).

    session    in-memory SQLite, seeded from demo/seed.json
    client     TestClient whose routes use that same session and a fresh event bus
    onboarded  profile set to EE / entrepreneur_account / 2000 / EUR / enabled
    events     list of (type, data) for every publish made during the test

Tests and routes share one session, so a test can change a row and the next
request sees it, and vice versa.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.db import get_session, reset_to_seed
from app.events import EventBus, get_bus
from app.main import create_app
from app.models import PROFILE_ID, ProfileRow


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        reset_to_seed(session)
        yield session
    engine.dispose()


@pytest.fixture
def client(session):
    app = create_app()
    bus = EventBus()
    app.state.test_bus = bus
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[get_bus] = lambda: bus
    # Not used as a context manager, so startup does not touch backend/data/app.db.
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
