"""Tax rules engine: country config, tax estimation and deadlines.

Integer maths only, no network. Country data lives in countries.json; every
regime carries its sources, the date it was checked and an `unverified` list.

Amounts are integers in the currency's minor unit as defined by ISO 4217:
cents for EUR or USD, whole units for JPY, KRW, CLP and ISK, thousandths for
KWD and BHD. Rates are basis points.
"""
import calendar
import json
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Optional

from .breakdown import describe_rule

_COUNTRIES_FILE = Path(__file__).with_name("countries.json")
_OTHER = "*"


@lru_cache(maxsize=1)
def _raw() -> tuple:
    with _COUNTRIES_FILE.open(encoding="utf-8") as f:
        return tuple(json.load(f))


def _country(code: str) -> Optional[dict]:
    for entry in _raw():
        if entry["code"] == code:
            return entry
    return None


def _resolve(code: str) -> Optional[dict]:
    """Follow `inheritsFrom` so territories reuse their parent's regimes."""
    seen = set()
    entry = _country(code)
    while entry and entry.get("inheritsFrom") and not entry.get("regimes"):
        if entry["code"] in seen:
            return None
        seen.add(entry["code"])
        parent = _country(entry["inheritsFrom"])
        if parent is None:
            return None
        entry = parent
    return entry


def load_countries() -> list:
    """Countries in API shape: code, name, currency and regimes with defaultRate and hint."""
    result = []
    for entry in _raw():
        source = _resolve(entry["code"])
        regimes = []
        for regime in (source or {}).get("regimes", []):
            item = {key: regime[key] for key in ("id", "name", "defaultRate", "hint", "deadline")}
            item["breakdownRule"] = describe_rule(regime)
            regimes.append(item)
        result.append(
            {
                "code": entry["code"],
                "name": entry["name"],
                "currency": entry.get("currency"),
                "regimes": regimes,
            }
        )
    return result


def get_regime(country: str, regime: str) -> Optional[dict]:
    """Full regime record for the exact (country, regime) pair, or None."""
    entry = _resolve(country)
    if not entry:
        return None
    for r in entry.get("regimes", []):
        if r["id"] == regime:
            return r
    return None


def compute_tax(amount: int, rate_bp: int) -> int:
    """amount * rate, rounded half up. Rate is in basis points."""
    return (amount * rate_bp + 5000) // 10000


def _clamp(value: int, floor: Optional[int], cap: Optional[int]) -> int:
    if floor is not None:
        value = max(value, floor)
    if cap is not None:
        value = min(value, cap)
    return value


def _progressive(taxable: int, brackets: list) -> int:
    tax, lower = 0, 0
    for bracket in brackets:
        upper = bracket["upToMinor"]
        top = taxable if upper is None else min(taxable, upper)
        if top > lower:
            tax += compute_tax(top - lower, bracket["rateBp"])
        if upper is None or taxable <= upper:
            break
        lower = upper
    return tax


def estimate_annual_tax(regime: dict, annual_income: int) -> dict:
    """Estimate yearly income tax and social contributions on a taxable base.

    `annual_income` is the base the regime taxes (see the regime's
    `incomeTax.base`): net profit for most regimes, turnover for turnover-based
    ones. Every rate is applied to that one base, so regimes that tax only a
    share of receipts must be given that share. Returns {"incomeTax", "social",
    "total"} in minor units. Raises ValueError for a regime whose rates are
    incomplete (`computable` is false).
    """
    if regime.get("computable") is False:
        raise ValueError("regime %s has incomplete rates" % regime.get("id"))
    if annual_income <= 0:
        return {"incomeTax": 0, "social": 0, "total": 0}
    spec = regime["incomeTax"]
    taxable = max(0, annual_income - (regime.get("allowanceMinor") or 0))
    if spec["type"] == "none":
        income_tax = 0
    elif spec["type"] == "flat":
        income_tax = compute_tax(taxable, spec["rateBp"])
    else:
        income_tax = _progressive(taxable, spec["brackets"])
    social = 0
    for item in regime.get("socialContributions", []):
        if item.get("fixedAnnualMinor") is not None:
            social += item["fixedAnnualMinor"]
        elif item.get("rateBp") is not None:
            base = _clamp(annual_income, item.get("floorMinor"), item.get("capMinor"))
            social += compute_tax(base, item["rateBp"])
    return {"incomeTax": income_tax, "social": social, "total": income_tax + social}


def _candidates(rule: dict, year: int) -> list:
    kind, day = rule.get("type"), rule.get("day")
    if not isinstance(day, int) or day < 1:
        return []
    if kind == "monthly":
        months = range(1, 13)
    elif kind == "annual" and rule.get("month"):
        months = [rule["month"]]
    elif kind == "quarterly" and rule.get("months"):
        months = sorted(rule["months"])
    else:
        return []          # a rule shape this engine does not know
    if not date.min.year <= year <= date.max.year:
        return []
    out = []
    for month in months:
        day = min(rule["day"], calendar.monthrange(year, month)[1])
        out.append(date(year, month, day))
    return out


def deadline_after(rules: list, today: date) -> Optional[date]:
    """First date on or after `today` produced by any of the deadline rules."""
    options = []
    for rule in rules or []:
        for year in (today.year, today.year + 1):
            options.extend(d for d in _candidates(rule, year) if d >= today)
    return min(options) if options else None


def next_deadline(country: str, regime: str, today: date) -> Optional[date]:
    """First deadline on or after `today`, or None when the regime has none."""
    found = get_regime(country, regime)
    return deadline_after(found.get("deadlines"), today) if found else None
