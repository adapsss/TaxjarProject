"""The backend refuses to start on a database that is not ready (plan Task 7)."""

import uuid

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app.main import check_database
from conftest import TEST_DATABASE_URL, migrate


@pytest.fixture
def scratch_engine():
    """A brand-new, empty database on the test server, dropped afterwards."""
    name = f"taxjar_startup_{uuid.uuid4().hex[:8]}"
    admin = create_engine(TEST_DATABASE_URL, isolation_level="AUTOCOMMIT")
    with admin.connect() as c:
        c.execute(text(f'CREATE DATABASE "{name}"'))
    engine = create_engine(make_url(TEST_DATABASE_URL).set(database=name))
    yield engine
    engine.dispose()
    with admin.connect() as c:
        c.execute(text(f'DROP DATABASE "{name}" WITH (FORCE)'))
    admin.dispose()


def test_startup_refuses_unmigrated_database(scratch_engine):
    with pytest.raises(SystemExit, match="^Database is not migrated: run alembic upgrade head"):
        check_database(scratch_engine)


def test_startup_refuses_empty_tax_data(scratch_engine):
    with scratch_engine.begin() as connection:
        migrate(connection)
    with pytest.raises(SystemExit, match="^Tax data is missing: run python -m app.data_load"):
        check_database(scratch_engine)


def test_startup_accepts_a_loaded_database(pg_engine):
    check_database(pg_engine)  # the test database is migrated and imported once per run


def test_data_load_command_on_a_fresh_database(scratch_engine, monkeypatch, capsys):
    """What the Compose `migrate` service runs: import every dataset, then seed the app state."""
    from app import data_load

    with scratch_engine.begin() as connection:
        migrate(connection)
    monkeypatch.setenv("DATABASE_URL", scratch_engine.url.render_as_string(hide_password=False))
    # The command runs in its own process in Compose: nothing has installed the engine's tax data.
    from app.engine import data as tax_data

    monkeypatch.setattr(tax_data, "_reader", None)
    monkeypatch.setattr(tax_data, "_data", None)
    assert data_load.main([]) == 0
    out = capsys.readouterr().out
    assert "tax: imported" in out and "demo_seed: imported" in out and "app state: seeded" in out
    assert data_load.main([]) == 0
    assert "tax: already present" in capsys.readouterr().out
    check_database(scratch_engine)
