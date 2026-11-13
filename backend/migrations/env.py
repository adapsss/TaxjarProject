"""Alembic environment. The URL comes from DATABASE_URL, or from a connection passed in by tests."""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine

from app import settings

config = context.config
if config.config_file_name is not None and not config.attributes.get("connection"):
    fileConfig(config.config_file_name, disable_existing_loggers=False)


def run_migrations_online() -> None:
    connection = config.attributes.get("connection")
    if connection is not None:
        context.configure(connection=connection)
        with context.begin_transaction():
            context.run_migrations()
        return
    engine = create_engine(settings.database_url())
    with engine.connect() as connection:
        context.configure(connection=connection)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    raise SystemExit("Offline SQL generation is not used here: run against a database.")
run_migrations_online()
