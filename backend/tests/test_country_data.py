"""Integrity checks over the researched data files."""
import json
from datetime import date
from pathlib import Path

from app.engine.tax_rules import deadline_after, estimate_annual_tax, get_regime, load_countries

ENGINE = Path(__file__).resolve().parents[1] / "app" / "engine"
COUNTRIES = json.loads((ENGINE / "countries.json").read_text(encoding="utf-8"))
FORMS = json.loads((ENGINE / "legal_forms.json").read_text(encoding="utf-8"))["forms"]


def regimes():
    for country in COUNTRIES:
        for regime in country["regimes"]:
            yield country, regime


def test_data_files_are_plain_ascii():
    for name in ("countries.json", "legal_forms.json"):
        (ENGINE / name).read_bytes().decode("ascii")


def test_engine_sources_are_ascii_except_nothing():
    for path in ENGINE.glob("*.py"):
        path.read_bytes().decode("ascii")


def test_country_codes_are_unique():
    codes = [c["code"] for c in COUNTRIES]
    assert len(codes) == len(set(codes))


def test_every_country_has_regimes_or_a_parent():
    codes = {c["code"] for c in COUNTRIES}
    for country in COUNTRIES:
        assert country["regimes"] or country["inheritsFrom"] in codes, country["code"]


def test_inherited_countries_resolve():
    for country in load_countries():
        assert country["regimes"], country["code"]


def test_regime_fields():
    for country, regime in regimes():
        where = country["code"] + "/" + regime["id"]
        assert 0 <= regime["suggestedReserveRateBp"] <= 10000, where
        assert regime["incomeTax"]["type"] in ("none", "flat", "progressive"), where
        assert regime["verifiedAt"], where
        if country["code"] != "*":
            assert regime["sources"], where
            assert all(s.startswith("http") for s in regime["sources"]), where


def test_regime_ids_unique_per_country():
    for country in COUNTRIES:
        ids = [r["id"] for r in country["regimes"]]
        assert len(ids) == len(set(ids)), country["code"]


def test_computable_regimes_estimate_sanely():
    for country, regime in regimes():
        if not regime["computable"]:
            continue
        where = country["code"] + "/" + regime["id"]
        low = estimate_annual_tax(regime, 1000000)
        high = estimate_annual_tax(regime, 100000000)
        assert 0 <= low["total"], where
        assert regime["incomeTax"]["type"] != "progressive" or regime["incomeTax"]["brackets"][-1]["upToMinor"] is None, where
        assert high["incomeTax"] <= 100000000, where
        assert high["incomeTax"] >= low["incomeTax"], where


def test_every_deadline_rule_produces_a_date():
    for country, regime in regimes():
        if regime["deadlines"]:
            assert deadline_after(regime["deadlines"], date(2026, 11, 13)), country["code"]


def test_get_regime_finds_every_listed_regime():
    for country in load_countries():
        for regime in country["regimes"]:
            assert get_regime(country["code"], regime["id"]) is not None


def test_legal_forms_are_well_formed():
    assert len(FORMS) > 50
    for form in FORMS:
        assert form["token"].strip() == form["token"] and len(form["token"]) >= 2
        assert isinstance(form["caseSensitive"], bool)
        assert form["countries"]
