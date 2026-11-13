from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import settings
from app.db import get_engine, init_db
from app.engine import data as tax_data
from app.errors import register_error_handlers
from app.routes import core, payments, reports


@asynccontextmanager
async def lifespan(app: FastAPI):
    install_tax_data()
    init_db()  # seed an empty database; the schema comes from `alembic upgrade head`
    yield


def install_tax_data() -> None:
    """The engine reads tax data from Postgres, refreshed every TAX_DATA_REFRESH_SECONDS."""
    from sqlmodel import Session

    from app.taxdata.repository import read_tax_data

    def read():
        with Session(get_engine()) as session:
            return read_tax_data(session)

    tax_data.install(read, settings.tax_data_refresh_seconds())


def create_app() -> FastAPI:
    app = FastAPI(title="Wise Tax Jar (hackathon prototype)", version="0.1.0", lifespan=lifespan)
    # Every error leaves as {"error": {"code", "message"}}.
    register_error_handlers(app)
    # One router per owner, so roles never edit the same file.
    app.include_router(core.router, prefix="/api")
    app.include_router(payments.router, prefix="/api")
    app.include_router(reports.router, prefix="/api")
    return app


app = create_app()
