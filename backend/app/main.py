from fastapi import FastAPI

from app.routes import core, payments, reports


def create_app() -> FastAPI:
    app = FastAPI(title="Wise Tax Jar (hackathon prototype)", version="0.1.0")
    # One router per owner, so roles never edit the same file.
    app.include_router(core.router, prefix="/api")
    app.include_router(payments.router, prefix="/api")
    app.include_router(reports.router, prefix="/api")
    return app


app = create_app()
