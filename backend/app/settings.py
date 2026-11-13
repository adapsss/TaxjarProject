"""Settings from the environment. Nothing here has a production default it could silently fall back to."""

import os


def database_url() -> str:
    """SQLAlchemy URL of the Postgres database, e.g. postgresql+psycopg://taxjar:taxjar@db:5432/taxjar."""
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    return url


def demo_mode() -> bool:
    """Reset, simulator and demo scenarios are served only in demo mode (default on)."""
    return os.environ.get("DEMO_MODE", "true").strip().lower() not in ("0", "false", "no", "off")


def tax_data_refresh_seconds() -> int:
    """How long tax data is kept in memory before it is read from the database again."""
    return int(os.environ.get("TAX_DATA_REFRESH_SECONDS", "60"))
