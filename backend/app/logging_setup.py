"""Leveled logs to stderr, one line per record, for the container's log collector.

LOG_LEVEL (default INFO) sets the level. Never log DATABASE_URL or anything else from the
environment that may hold a secret.
"""
import logging
import sys

from app import settings

_FORMAT = "%(asctime)s %(levelname)s %(name)s %(message)s"


def configure_logging() -> None:
    level = getattr(logging, settings.log_level().strip().upper(), None)
    if not isinstance(level, int):
        level = logging.INFO
    root = logging.getLogger()
    root.setLevel(level)
    if not any(getattr(h, "_taxjar", False) for h in root.handlers):
        handler = logging.StreamHandler(sys.stderr)
        handler.setFormatter(logging.Formatter(_FORMAT))
        handler._taxjar = True  # added once, however often this runs
        root.addHandler(handler)
