"""The tax data the engine works on, read from the database and kept for a short while.

The engine has no database code: the app installs a reader (app.taxdata.repository.read_tax_data
behind a session) at startup. current() re-reads when the copy in memory is older than the refresh
interval, so a rate edited in SQL reaches the engine without a restart.
"""
import threading
import time
from typing import Callable, Optional

_lock = threading.Lock()
_reader: Optional[Callable[[], object]] = None
_refresh_seconds = 60.0
_clock: Callable[[], float] = time.monotonic
_data = None
_read_at = 0.0


def install(reader: Callable[[], object], refresh_seconds: float, clock: Callable[[], float] = time.monotonic) -> None:
    """Use `reader` (returns a TaxData) from now on; the next current() reads afresh."""
    global _reader, _refresh_seconds, _clock, _data
    with _lock:
        _reader, _refresh_seconds, _clock, _data = reader, float(refresh_seconds), clock, None


def current():
    """The TaxData to use now (countries, legal_forms, version)."""
    global _data, _read_at
    with _lock:
        if _reader is None:
            raise RuntimeError("tax data not installed")
        now = _clock()
        if _data is None or now - _read_at >= _refresh_seconds:
            _data, _read_at = _reader(), now
        return _data


def clear() -> None:
    """Drop the copy in memory; the next current() reads again. For tests and after a replace."""
    global _data
    with _lock:
        _data = None
