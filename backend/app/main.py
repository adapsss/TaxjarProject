from contextlib import asynccontextmanager
from pathlib import Path

import anyio.to_thread
from fastapi import FastAPI

from app import settings
from app.logging_setup import configure_logging
from app.db import get_engine, init_db
from app.limits import WORKER_THREADS, InFlightLimitMiddleware
from app.engine import data as tax_data
from app.errors import register_error_handlers
from app.request_log import RequestLogMiddleware
from app.routes import core, payments, reports


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Handlers run in worker threads: enough for every request admitted at once (see app/limits.py).
    anyio.to_thread.current_default_thread_limiter().total_tokens = WORKER_THREADS
    check_database(get_engine())
    install_tax_data()
    init_db()  # seed an empty database; the schema comes from `alembic upgrade head`
    yield


BACKEND_DIR = Path(__file__).resolve().parent.parent


def check_database(engine) -> None:
    """Refuse to start on a database that is not ready, naming the step that is missing."""
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    from sqlalchemy import inspect, text

    head = ScriptDirectory.from_config(Config(str(BACKEND_DIR / "alembic.ini"))).get_current_head()
    with engine.connect() as connection:
        version = None
        if inspect(connection).has_table("alembic_version"):
            version = connection.execute(text("SELECT version_num FROM alembic_version")).scalar()
        if version != head:
            raise SystemExit(
                f"Database is not migrated: run alembic upgrade head (database at {version or 'nothing'}, code at {head})"
            )
        if not connection.execute(text("SELECT EXISTS (SELECT 1 FROM tax_country)")).scalar():
            raise SystemExit("Tax data is missing: run python -m app.data_load")
        if not connection.execute(text("SELECT EXISTS (SELECT 1 FROM demo_seed)")).scalar():
            raise SystemExit("Demo seed is missing: run python -m app.data_load")


def install_tax_data() -> None:
    """The engine reads tax data from Postgres, refreshed every TAX_DATA_REFRESH_SECONDS."""
    from sqlmodel import Session

    from app.taxdata.repository import read_tax_data

    def read():
        with Session(get_engine()) as session:
            return read_tax_data(session)

    tax_data.install(read, settings.tax_data_refresh_seconds())


def create_app() -> FastAPI:
    configure_logging()
    app = FastAPI(title="Wise Tax Jar (hackathon prototype)", version="0.1.0", lifespan=lifespan)
    # Every error leaves as {"error": {"code", "message"}}.
    register_error_handlers(app)
    # One router per owner, so roles never edit the same file.
    app.include_router(core.router, prefix="/api")
    app.include_router(payments.router, prefix="/api")
    app.include_router(reports.router, prefix="/api")
    app.add_middleware(InFlightLimitMiddleware)
    # Added last, so it wraps the limiter: the logged time includes the wait for a slot, and every
    # response (also a 500 after a crash) carries X-Request-ID.
    app.add_middleware(RequestLogMiddleware)
    return app


app = create_app()
