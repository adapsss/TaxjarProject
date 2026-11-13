"""Tax rules and country config (Task C2). Integer maths only.

Deadline rules in countries.json are placeholders until role D verifies them
against official sources (shared plan, decision 7).
"""

import copy
import json
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

COUNTRIES_PATH = Path(__file__).with_name("countries.json")


@lru_cache(maxsize=1)
def _countries() -> tuple:
    return tuple(json.loads(COUNTRIES_PATH.read_text(encoding="utf-8")))


def load_countries() -> List[dict]:
    """Shape of schemas.Country, plus a "deadline" per regime. A fresh copy each call."""
    return copy.deepcopy(list(_countries()))


def get_regime(country: str, regime: str) -> Optional[dict]:
    for entry in _countries():
        if entry["code"] == country:
            for candidate in entry["regimes"]:
                if candidate["id"] == regime:
                    return copy.deepcopy(candidate)
    return None


def compute_tax(amount: int, rate_bp: int) -> int:
    """amount x rate, rounded half up. amount in minor units, rate in basis points."""
    return (amount * rate_bp + 5000) // 10000


def _add_months(year: int, month: int, months: int) -> tuple:
    index = year * 12 + (month - 1) + months
    return index // 12, index % 12 + 1


def next_deadline(country: str, regime: str, today: date) -> Optional[date]:
    """The first deadline on or after today, or None when the regime has no rule."""
    found = get_regime(country, regime)
    rule = found.get("deadline") if found else None
    if not rule:
        return None
    day = rule["day"]
    if rule["type"] == "monthly":
        months = list(range(1, 13))
    elif rule["type"] == "quarterly":
        months = rule["months"]
    else:
        return None
    for offset in range(0, 13):
        year, month = _add_months(today.year, today.month, offset)
        if month in months:
            candidate = date(year, month, day)
            if candidate >= today:
                return candidate
    return None
