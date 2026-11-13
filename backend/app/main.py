from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import init_db
from app.errors import register_error_handlers
from app.routes import core, payments, reports


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()  # create tables; seed backend/data/app.db on first run
    yield


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
