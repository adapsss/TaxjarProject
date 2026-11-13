"""Tax data between Postgres rows and the engine's shapes.

The engine works on the dicts countries.json and legal_forms.json describe. write_tax_data stores
those dicts as rows; read_tax_data rebuilds exactly the same dicts, key for key, so the engine's
maths does not change. tests/test_data_load.py checks the round trip field for field.
"""
from dataclasses import dataclass
from datetime import date
from typing import Iterable

import sqlalchemy as sa
from sqlalchemy.orm import Session

from . import tables as t


@dataclass(frozen=True)
class TaxData:
    countries: tuple  # dicts in the countries.json shape and order
    legal_forms: tuple  # dicts in the legal_forms.json "forms" shape and order
    version: int  # id of the latest tax_data_load row, 0 when nothing was imported


# ---------- writing ----------


def write_tax_data(session: Session, countries: Iterable[dict], legal_forms: Iterable[dict]) -> int:
    """Insert every country, regime and legal form. The tables must be empty. Returns the rows written."""
    rows = {table: [] for table in (t.country, t.regime, t.social_contribution, t.part, t.extra_part, t.deadline, t.source)}
    for position, c in enumerate(countries):
        rows[t.country].append({
            "code": c["code"], "name": c["name"], "currency": c["currency"],
            "tax_year_start_month": c["taxYear"]["startMonth"], "tax_year_start_day": c["taxYear"]["startDay"],
            "inherits_from": c["inheritsFrom"], "position": position,
        })
        for r_pos, r in enumerate(c["regimes"]):
            key = {"country_code": c["code"], "regime_id": r["id"]}
            income = r["incomeTax"]
            rows[t.regime].append({
                "country_code": c["code"], "id": r["id"], "position": r_pos, "name": r["name"],
                "applies_to": r["appliesTo"], "computable": r["computable"], "allowance_minor": r["allowanceMinor"],
                "income_tax_type": income["type"], "income_tax_rate_bp": income.get("rateBp"),
                "income_tax_base": income["base"], "income_tax_brackets": income.get("brackets"),
                "vat_registration_threshold_minor": r["vat"]["registrationThresholdMinor"],
                "vat_standard_rate_bp": r["vat"]["standardRateBp"],
                "suggested_reserve_rate_bp": r["suggestedReserveRateBp"], "default_rate_bp": r["defaultRate"],
                "reserve_rate_source": r["reserveRateSource"], "reserve_basis": r["reserveBasis"],
                "rule_text": r["ruleText"], "hint": r["hint"], "verification": r["verification"],
                "verified_at": date.fromisoformat(r["verifiedAt"]), "notes": r["notes"], "unverified": r["unverified"],
            })
            for i, s in enumerate(r["socialContributions"]):
                rows[t.social_contribution].append({
                    **key, "position": i, "name": s["name"], "rate_bp": s["rateBp"], "base": s["base"],
                    "floor_minor": s["floorMinor"], "cap_minor": s["capMinor"], "fixed_annual_minor": s["fixedAnnualMinor"],
                })
            for i, p in enumerate(r["components"] or []):
                rows[t.part].append({**key, "position": i, "part_id": p["id"], "name": p["name"],
                                     "share_num": p["shareNum"], "share_den": p["shareDen"]})
            if r["extraComponent"]:
                x = r["extraComponent"]
                rows[t.extra_part].append({**key, "part_id": x["id"], "name": x["name"], "rates_bp": x["ratesBp"]})
            primary = r["deadline"]
            primary_index = next((i for i, d in enumerate(r["deadlines"]) if d == primary), None)
            for i, d in enumerate(r["deadlines"]):
                rows[t.deadline].append({**key, "position": i, "name": d["name"], "type": d["type"], "day": d["day"],
                                         "month": d.get("month"), "months": d.get("months"),
                                         "is_primary": i == primary_index})
            for i, url in enumerate(r["sources"]):
                rows[t.source].append({**key, "position": i, "url": url})
    forms = [
        {"position": i, "token": f["token"], "name": f["name"], "case_sensitive": f["caseSensitive"],
         "caps_safe": f["capsSafe"], "caps_leading": f["capsLeading"], "countries": f["countries"]}
        for i, f in enumerate(legal_forms)
    ]
    # Parents first; a country may inherit from one listed later (the foreign key is deferred).
    for table in (t.country, t.regime, t.social_contribution, t.part, t.extra_part, t.deadline, t.source):
        if rows[table]:
            session.execute(table.insert(), rows[table])
    if forms:
        session.execute(t.legal_form.insert(), forms)
    return sum(len(v) for v in rows.values()) + len(forms)


def delete_tax_data(session: Session) -> None:
    for table in t.DATA_TABLES_CHILDREN_FIRST:
        session.execute(table.delete())
    session.execute(t.legal_form.delete())


def has_tax_data(session: Session) -> bool:
    return session.execute(sa.select(sa.func.count()).select_from(t.country)).scalar_one() > 0


# ---------- reading ----------


def _grouped(session: Session, table: sa.Table) -> dict:
    order = [table.c.country_code, table.c.regime_id] + ([table.c.position] if "position" in table.c else [])
    grouped: dict = {}
    for row in session.execute(sa.select(table).order_by(*order)).mappings():
        grouped.setdefault((row["country_code"], row["regime_id"]), []).append(row)
    return grouped


def _deadline(row) -> dict:
    d = {"name": row["name"], "type": row["type"], "day": row["day"]}
    if row["month"] is not None:
        d["month"] = row["month"]
    if row["months"] is not None:
        d["months"] = list(row["months"])
    return d


def read_tax_data(session: Session) -> TaxData:
    social = _grouped(session, t.social_contribution)
    parts = _grouped(session, t.part)
    extras = _grouped(session, t.extra_part)
    deadlines = _grouped(session, t.deadline)
    sources = _grouped(session, t.source)

    regimes: dict = {}
    for r in session.execute(sa.select(t.regime).order_by(t.regime.c.country_code, t.regime.c.position)).mappings():
        key = (r["country_code"], r["id"])
        income = {"type": r["income_tax_type"], "base": r["income_tax_base"]}
        if r["income_tax_brackets"] is not None:
            income["brackets"] = r["income_tax_brackets"]
        if r["income_tax_rate_bp"] is not None:
            income["rateBp"] = r["income_tax_rate_bp"]
        regime_deadlines = deadlines.get(key, [])
        primary = next((_deadline(d) for d in regime_deadlines if d["is_primary"]), None)
        extra = extras.get(key)
        regimes.setdefault(r["country_code"], []).append({
            "id": r["id"], "name": r["name"], "appliesTo": r["applies_to"], "incomeTax": income,
            "computable": r["computable"], "allowanceMinor": r["allowance_minor"],
            "socialContributions": [
                {"name": s["name"], "rateBp": s["rate_bp"], "base": s["base"], "floorMinor": s["floor_minor"],
                 "capMinor": s["cap_minor"], "fixedAnnualMinor": s["fixed_annual_minor"]}
                for s in social.get(key, [])
            ],
            "vat": {"registrationThresholdMinor": r["vat_registration_threshold_minor"],
                    "standardRateBp": r["vat_standard_rate_bp"]},
            "suggestedReserveRateBp": r["suggested_reserve_rate_bp"], "reserveRateSource": r["reserve_rate_source"],
            "reserveBasis": r["reserve_basis"], "deadlines": [_deadline(d) for d in regime_deadlines],
            "notes": r["notes"], "unverified": list(r["unverified"]),
            "components": [
                {"id": p["part_id"], "name": p["name"], "shareNum": p["share_num"], "shareDen": p["share_den"]}
                for p in parts[key]
            ] if key in parts else None,
            "extraComponent": {"id": extra[0]["part_id"], "name": extra[0]["name"], "ratesBp": list(extra[0]["rates_bp"])}
            if extra else None,
            "verification": r["verification"], "ruleText": r["rule_text"],
            "sources": [s["url"] for s in sources.get(key, [])], "verifiedAt": r["verified_at"].isoformat(),
            "defaultRate": r["default_rate_bp"], "hint": r["hint"], "deadline": primary,
        })

    countries = tuple(
        {"code": c["code"], "name": c["name"], "currency": c["currency"],
         "taxYear": {"startMonth": c["tax_year_start_month"], "startDay": c["tax_year_start_day"]},
         "inheritsFrom": c["inherits_from"], "regimes": regimes.get(c["code"], [])}
        for c in session.execute(sa.select(t.country).order_by(t.country.c.position)).mappings()
    )
    legal_forms = tuple(
        {"token": f["token"], "caseSensitive": f["case_sensitive"], "name": f["name"], "countries": list(f["countries"]),
         "capsSafe": f["caps_safe"], "capsLeading": f["caps_leading"]}
        for f in session.execute(sa.select(t.legal_form).order_by(t.legal_form.c.position)).mappings()
    )
    version = session.execute(sa.select(sa.func.coalesce(sa.func.max(t.data_load.c.id), 0))).scalar_one()
    return TaxData(countries=countries, legal_forms=legal_forms, version=version)
