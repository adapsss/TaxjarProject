"""Import the built JSON into an empty database:  python -m app.data_load [--replace DATASET]

The database is the source of truth. Each dataset is imported only while its tables are
empty, so every start of the stack can run this safely; after that, changes are made to the
rows. `--replace DATASET` is the one way to overwrite a dataset from the JSON again. Every
import and replace is recorded in tax_data_load (and, through the trigger, in tax_change_log).

All or nothing: every file that will be written is checked first (app/import_checks.py), and the
whole run is one transaction. A bad file exits non-zero naming the file and leaves the database
exactly as it was; restoring the file and running again then imports normally. Data already in
the database that is incomplete or invalid is never overwritten silently: the run fails and
names the --replace command that fixes it.
"""
import argparse
import hashlib
import sys
from pathlib import Path
from typing import List, Optional

import sqlalchemy as sa
from sqlalchemy.orm import Session

from app.import_checks import ImportProblem, check_countries, check_legal_forms, check_scenarios, check_seed, check_seed_content
from app.taxdata import repository
from app.taxdata import tables as t

BACKEND_DIR = Path(__file__).resolve().parent.parent
ENGINE_DIR = BACKEND_DIR / "app" / "engine"
DATASETS = ("tax", "demo_seed", "demo_scenarios")
DEMO_DIR = BACKEND_DIR.parent / "demo"

FILES = {
    "tax": (ENGINE_DIR / "countries.json", ENGINE_DIR / "legal_forms.json"),
    "demo_seed": (DEMO_DIR / "seed.json",),
    "demo_scenarios": (DEMO_DIR / "scenarios.json",),
}
DEMO_TABLES = {"demo_seed": t.demo_seed, "demo_scenarios": t.demo_scenario}


def _checksum(paths) -> str:
    digest = hashlib.sha256()
    for path in paths:
        digest.update(path.read_bytes())
    return digest.hexdigest()


def _count(session: Session, table) -> int:
    return session.execute(sa.select(sa.func.count()).select_from(table)).scalar_one()


def _present(session: Session, dataset: str) -> bool:
    """True when the dataset is in the database and usable; raises ImportProblem when it is there but broken."""
    if dataset == "tax":
        counts = {"countries": _count(session, t.country), "regimes": _count(session, t.regime),
                  "legal forms": _count(session, t.legal_form)}
        if not any(counts.values()):
            return False
        empty = [name for name, n in counts.items() if n == 0]
        if empty:
            raise ImportProblem("database", f"tax data is incomplete (no {', '.join(empty)}): "
                                            "run python -m app.data_load --replace tax")
        return True
    if dataset == "demo_seed":
        row = session.execute(sa.select(t.demo_seed.c.data)).first()
        if row is None:
            return False
        try:
            check_seed_content("database demo_seed", row[0])
        except ImportProblem as exc:
            raise ImportProblem("database", f"the stored demo seed is invalid ({exc.problem}): "
                                            "run python -m app.data_load --replace demo_seed") from None
        return True
    return _count(session, DEMO_TABLES[dataset]) > 0


def _read(dataset: str, files: dict):
    """The checked content of a dataset's files; raises ImportProblem naming the file."""
    if dataset == "tax":
        countries_file, forms_file = files["tax"]
        return check_countries(countries_file), check_legal_forms(forms_file)
    (path,) = files[dataset]
    return check_seed(path) if dataset == "demo_seed" else check_scenarios(path)


def _write(session: Session, dataset: str, content) -> int:
    if dataset == "tax":
        countries, forms = content
        return repository.write_tax_data(session, countries, forms)
    if dataset == "demo_seed":
        session.execute(t.demo_seed.insert().values(id=1, data=content))
        return 1
    rows = [
        {"id": s["id"], "position": i, "label": s["label"], "sender_name": s["senderName"],
         "sender_kind": s.get("senderKind"), "amount": s["amount"], "currency": s["currency"],
         "reference": s["reference"], "expect": s["expect"]}
        for i, s in enumerate(content)
    ]
    session.execute(t.demo_scenario.insert(), rows)
    return len(rows)


def _delete(session: Session, dataset: str) -> None:
    if dataset == "tax":
        repository.delete_tax_data(session)
        return
    session.execute(DEMO_TABLES[dataset].delete())


def import_all(session: Session, replace: Optional[str] = None, files: Optional[dict] = None) -> dict:
    """Import every dataset that is missing (and `replace`), all or nothing. Commits once.

    Returns {dataset: "imported" | "already present" | "replaced"}. Raises ImportProblem before
    writing anything when a file or the stored data is unusable; the caller rolls back.
    """
    files = files or FILES
    if replace is not None and replace not in DATASETS:
        raise ValueError(f"unknown dataset {replace!r}; choose from {', '.join(DATASETS)}")
    plan = {}
    for dataset in DATASETS:
        if dataset == replace:
            present = _count_any(session, dataset)
            plan[dataset] = ("replaced" if present else "imported", _read(dataset, files))
        elif _present(session, dataset):
            plan[dataset] = ("already present", None)
        else:
            plan[dataset] = ("imported", _read(dataset, files))
    for dataset, (outcome, content) in plan.items():
        if content is None:
            continue
        if outcome == "replaced":
            _delete(session, dataset)
        rows = _write(session, dataset, content)
        session.execute(
            t.data_load.insert().values(
                dataset=dataset, mode="replace" if outcome == "replaced" else "import",
                checksum=_checksum(files[dataset]), rows=rows,
            )
        )
    session.commit()
    return {dataset: outcome for dataset, (outcome, _) in plan.items()}


def _count_any(session: Session, dataset: str) -> bool:
    """Any rows at all, valid or not: what a replace has to delete."""
    if dataset == "tax":
        return any(_count(session, table) for table in (t.country, t.regime, t.legal_form))
    return _count(session, DEMO_TABLES[dataset]) > 0


def import_dataset(session: Session, dataset: str, replace: bool = False) -> str:
    """One dataset on its own (tests and tools): "imported", "already present" or "replaced". Commits."""
    if dataset not in DATASETS:
        raise ValueError(f"unknown dataset {dataset!r}; choose from {', '.join(DATASETS)}")
    if replace:
        outcome = "replaced" if _count_any(session, dataset) else "imported"
        content = _read(dataset, FILES)
        if outcome == "replaced":
            _delete(session, dataset)
    elif _present(session, dataset):
        return "already present"
    else:
        outcome, content = "imported", _read(dataset, FILES)
    rows = _write(session, dataset, content)
    session.execute(
        t.data_load.insert().values(
            dataset=dataset, mode="replace" if outcome == "replaced" else "import",
            checksum=_checksum(FILES[dataset]), rows=rows,
        )
    )
    session.commit()
    return outcome


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.data_load", description=__doc__.splitlines()[0])
    parser.add_argument("--replace", metavar="DATASET", help=f"overwrite one dataset from the JSON: {', '.join(DATASETS)}")
    args = parser.parse_args(argv)
    if args.replace is not None and args.replace not in DATASETS:
        print(f"Unknown dataset {args.replace!r}. Datasets: {', '.join(DATASETS)}", file=sys.stderr)
        return 2

    from app import settings

    from sqlmodel import Session as AppSession  # the app's session type: db.seed_if_empty uses .exec()

    from app.db import seed_if_empty
    from app.engine import data as tax_data

    engine = sa.create_engine(settings.database_url())
    try:
        with AppSession(engine) as session:
            try:
                outcomes = import_all(session, replace=args.replace)
            except ImportProblem as problem:
                session.rollback()
                print(f"Import failed, nothing was written: {problem}", file=sys.stderr)
                return 1
            for dataset, outcome in outcomes.items():
                print(f"{dataset}: {outcome}")
            # Seeding classifies the seed's payers, which needs the tax data just imported.
            tax_data.install(lambda: repository.read_tax_data(session), refresh_seconds=3600)
            if seed_if_empty(session):
                print("app state: seeded from demo_seed")
    finally:
        engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
