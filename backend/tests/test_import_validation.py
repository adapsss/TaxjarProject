"""The import checks every file before it writes, and a failed run leaves the database untouched.

On AWS the import runs as a sync hook on every rollout: a bad JSON must fail it cleanly, with a
message naming the file, so the rollout stops and the old pods keep serving an unchanged database.
"""
import json
import shutil
from pathlib import Path

import pytest
from sqlalchemy import text

from app import data_load

REAL = data_load.FILES


@pytest.fixture
def files(tmp_path):
    """A copy of the real import files that a test may break."""
    copies = {}
    for dataset, paths in REAL.items():
        copies[dataset] = tuple(Path(shutil.copy(p, tmp_path / f"{dataset}-{p.name}")) for p in paths)
    return copies


def _empty_database(session):
    session.execute(text("TRUNCATE tax_country, legal_form, tax_data_load, demo_seed, demo_scenario RESTART IDENTITY CASCADE"))
    session.commit()


def _counts(session):
    return session.execute(
        text(
            "SELECT (SELECT count(*) FROM tax_country), (SELECT count(*) FROM legal_form), "
            "(SELECT count(*) FROM demo_seed), (SELECT count(*) FROM demo_scenario), (SELECT count(*) FROM tax_data_load)"
        )
    ).one()


BROKEN = {
    "an empty file": "",
    "an empty list": "[]",
    "an empty object": "{}",
    "not JSON": "{not json",
}

TARGETS = {
    "countries": ("tax", 0),
    "legal forms": ("tax", 1),
    "seed": ("demo_seed", 0),
    "scenarios": ("demo_scenarios", 0),
}


@pytest.mark.parametrize("target", TARGETS)
@pytest.mark.parametrize("content", BROKEN)
def test_a_broken_file_fails_cleanly_and_writes_nothing(session, files, target, content):
    _empty_database(session)
    dataset, index = TARGETS[target]
    broken = files[dataset][index]
    broken.write_text(BROKEN[content], encoding="utf-8")

    with pytest.raises(data_load.ImportProblem) as problem:
        data_load.import_all(session, files=files)

    assert broken.name in str(problem.value)
    session.rollback()
    assert tuple(_counts(session)) == (0, 0, 0, 0, 0)  # every dataset, not just the broken one


@pytest.mark.parametrize(
    "dataset, index, change, missing",
    [
        ("demo_seed", 0, lambda d: d.pop("profile"), "profile"),
        ("demo_seed", 0, lambda d: d["profile"].pop("taxCurrency"), "taxCurrency"),
        ("demo_seed", 0, lambda d: d.__setitem__("jars", [j for j in d["jars"] if j["id"] != "tax"]), "Tax Jar"),
        ("demo_scenarios", 0, lambda d: d[0].pop("senderName"), "senderName"),
        ("tax", 0, lambda d: d[0].pop("regimes"), "regimes"),
        ("tax", 0, lambda d: d[0]["regimes"][0].pop("defaultRate") if d[0]["regimes"] else d[1]["regimes"][0].pop("defaultRate"), "defaultRate"),
        ("tax", 1, lambda d: d["forms"][0].pop("token"), "token"),
    ],
)
def test_a_missing_key_is_named(session, files, dataset, index, change, missing):
    _empty_database(session)
    path = files[dataset][index]
    content = json.loads(path.read_text(encoding="utf-8"))
    change(content)
    path.write_text(json.dumps(content), encoding="utf-8")

    with pytest.raises(data_load.ImportProblem) as problem:
        data_load.import_all(session, files=files)

    assert path.name in str(problem.value) and missing in str(problem.value)
    session.rollback()
    assert tuple(_counts(session)) == (0, 0, 0, 0, 0)


def test_restoring_the_real_files_recovers_on_the_same_database(session, files):
    _empty_database(session)
    files["demo_scenarios"][0].write_text("[]", encoding="utf-8")
    with pytest.raises(data_load.ImportProblem):
        data_load.import_all(session, files=files)
    session.rollback()

    outcomes = data_load.import_all(session, files=REAL)

    assert outcomes == {"tax": "imported", "demo_seed": "imported", "demo_scenarios": "imported"}
    counts = tuple(_counts(session))
    assert counts[:4] == (80, 496, 1, 8) and counts[4] == 3


def test_filled_tables_are_skipped_without_reading_their_files(session, files):
    # The database is the source of truth: a broken file for a dataset already loaded must not block a deploy.
    files["tax"][0].write_text("", encoding="utf-8")
    assert data_load.import_all(session, files=files) == {
        "tax": "already present", "demo_seed": "already present", "demo_scenarios": "already present",
    }


def test_an_invalid_stored_seed_fails_loudly_and_points_to_replace(session, files):
    session.execute(text("UPDATE demo_seed SET data = '{}'::jsonb"))
    with pytest.raises(data_load.ImportProblem) as problem:
        data_load.import_all(session, files=files)
    assert "--replace demo_seed" in str(problem.value)
    session.rollback()

    session.execute(text("UPDATE demo_seed SET data = '{}'::jsonb"))
    outcomes = data_load.import_all(session, replace="demo_seed", files=files)
    assert outcomes["demo_seed"] == "replaced"
    assert session.execute(text("SELECT data ? 'profile' FROM demo_seed")).scalar_one() is True


def test_half_loaded_tax_data_fails_loudly_and_points_to_replace(session, files):
    session.execute(text("DELETE FROM legal_form"))
    with pytest.raises(data_load.ImportProblem) as problem:
        data_load.import_all(session, files=files)
    assert "--replace tax" in str(problem.value)


def test_the_command_exits_non_zero_with_the_file_named(monkeypatch, capsys, pg_engine):
    seed = Path("/data/demo/seed.json")

    def failing_import(session, replace=None, files=None):
        raise data_load.ImportProblem(seed, "the file is empty")

    monkeypatch.setattr(data_load, "import_all", failing_import)
    monkeypatch.setenv("DATABASE_URL", pg_engine.url.render_as_string(hide_password=False))
    assert data_load.main([]) == 1
    err = capsys.readouterr().err
    assert "seed.json: the file is empty" in err and "nothing was written" in err
