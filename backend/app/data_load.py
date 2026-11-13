"""Import the built JSON into an empty database:  python -m app.data_load [--replace DATASET]

The database is the source of truth. Each dataset is imported only while its tables are
empty, so every start of the stack can run this safely; after that, changes are made to the
rows. `--replace DATASET` is the one way to overwrite a dataset from the JSON again. Every
import and replace is recorded in tax_data_load (and, through the trigger, in tax_change_log).
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import List, Optional

import sqlalchemy as sa
from sqlalchemy.orm import Session

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


def _present(session: Session, dataset: str) -> bool:
    if dataset == "tax":
        return repository.has_tax_data(session)
    table = DEMO_TABLES[dataset]
    return session.execute(sa.select(sa.func.count()).select_from(table)).scalar_one() > 0


def _write(session: Session, dataset: str) -> int:
    if dataset == "tax":
        countries_file, forms_file = FILES["tax"]
        countries = json.loads(countries_file.read_text(encoding="utf-8"))
        forms = json.loads(forms_file.read_text(encoding="utf-8"))["forms"]
        return repository.write_tax_data(session, countries, forms)
    (path,) = FILES[dataset]
    content = json.loads(path.read_text(encoding="utf-8"))
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


def import_dataset(session: Session, dataset: str, replace: bool = False) -> str:
    """"imported", "already present" or "replaced". Commits on import and replace."""
    if dataset not in DATASETS:
        raise ValueError(f"unknown dataset {dataset!r}; choose from {', '.join(DATASETS)}")
    present = _present(session, dataset)
    if present and not replace:
        return "already present"
    if present:
        _delete(session, dataset)
    rows = _write(session, dataset)
    session.execute(
        t.data_load.insert().values(
            dataset=dataset, mode="replace" if present else "import", checksum=_checksum(FILES[dataset]), rows=rows,
        )
    )
    session.commit()
    return "replaced" if present else "imported"


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.data_load", description=__doc__.splitlines()[0])
    parser.add_argument("--replace", metavar="DATASET", help=f"overwrite one dataset from the JSON: {', '.join(DATASETS)}")
    args = parser.parse_args(argv)
    if args.replace is not None and args.replace not in DATASETS:
        print(f"Unknown dataset {args.replace!r}. Datasets: {', '.join(DATASETS)}", file=sys.stderr)
        return 2

    from app import settings

    from app.db import seed_if_empty

    engine = sa.create_engine(settings.database_url())
    try:
        with Session(engine) as session:
            for dataset in DATASETS:
                outcome = import_dataset(session, dataset, replace=dataset == args.replace)
                print(f"{dataset}: {outcome}")
            if seed_if_empty(session):
                print("app state: seeded from demo_seed")
    finally:
        engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
