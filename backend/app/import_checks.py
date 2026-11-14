"""Checks on the import files before anything is written (used by app/data_load.py).

Each check returns the parsed content or raises ImportProblem naming the file and what is wrong,
so a bad file fails the migrate job cleanly instead of half-filling the database. The keys checked
are the ones the importer and db.reset_to_seed read.
"""
import json
from pathlib import Path


class ImportProblem(Exception):
    def __init__(self, path, problem: str):
        self.path = Path(path)
        self.problem = problem
        super().__init__(f"{self.path}: {problem}")


COUNTRY_KEYS = ("code", "name", "currency", "taxYear", "inheritsFrom", "regimes")
REGIME_KEYS = (
    "id", "name", "appliesTo", "incomeTax", "computable", "allowanceMinor", "socialContributions", "vat",
    "suggestedReserveRateBp", "reserveRateSource", "reserveBasis", "deadlines", "notes", "unverified",
    "components", "extraComponent", "verification", "ruleText", "sources", "verifiedAt", "defaultRate",
    "hint", "deadline",
)
LEGAL_FORM_KEYS = ("token", "caseSensitive", "name", "countries", "capsSafe", "capsLeading")
SEED_KEYS = ("owner", "profile", "balances", "jars", "transactions")
SEED_PROFILE_KEYS = ("country", "regime", "rate", "taxCurrency", "enabled")
SEED_BALANCE_KEYS = ("currency", "amount")
SEED_JAR_KEYS = ("id", "name", "currency", "balance", "type")
SEED_TRANSACTION_KEYS = ("direction", "amount", "currency", "senderName", "createdAt", "label")
SCENARIO_KEYS = ("id", "label", "senderName", "amount", "currency", "reference", "expect")


def read_json(path):
    path = Path(path)
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise ImportProblem(path, f"cannot be read ({exc.strerror or exc})") from None
    if not raw.strip():
        raise ImportProblem(path, "the file is empty")
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ImportProblem(path, f"is not valid JSON ({exc})") from None


def _keys(path, item, keys, where: str) -> None:
    if not isinstance(item, dict):
        raise ImportProblem(path, f"{where} is not an object")
    missing = [k for k in keys if k not in item]
    if missing:
        raise ImportProblem(path, f"{where} is missing {', '.join(missing)}")


def _non_empty_list(path, value, what: str) -> list:
    if not isinstance(value, list) or not value:
        raise ImportProblem(path, f"{what} must be a non-empty list")
    return value


def check_countries(path) -> list:
    countries = _non_empty_list(path, read_json(path), "the country list")
    for i, country in enumerate(countries):
        where = f"country {i} ({country.get('code', '?') if isinstance(country, dict) else '?'})"
        _keys(path, country, COUNTRY_KEYS, where)
        if not isinstance(country["regimes"], list):
            raise ImportProblem(path, f"{where}: regimes must be a list")
        for j, regime in enumerate(country["regimes"]):
            _keys(path, regime, REGIME_KEYS, f"{where} regime {j}")
    if not any(country["regimes"] for country in countries):
        raise ImportProblem(path, "no country has a regime")
    return countries


def check_legal_forms(path) -> list:
    content = read_json(path)
    if not isinstance(content, dict) or "forms" not in content:
        raise ImportProblem(path, 'must be an object with a "forms" list')
    forms = _non_empty_list(path, content["forms"], '"forms"')
    for i, form in enumerate(forms):
        _keys(path, form, LEGAL_FORM_KEYS, f"legal form {i}")
    return forms


def check_seed(path) -> dict:
    return check_seed_content(path, read_json(path))


def check_seed_content(path, seed) -> dict:
    """Also used on the seed already stored in the database."""
    _keys(path, seed, SEED_KEYS, "the seed")
    _keys(path, seed["profile"], SEED_PROFILE_KEYS, "the seed's profile")
    for i, balance in enumerate(_non_empty_list(path, seed["balances"], "the seed's balances")):
        _keys(path, balance, SEED_BALANCE_KEYS, f"balance {i}")
    jars = _non_empty_list(path, seed["jars"], "the seed's jars")
    for i, jar in enumerate(jars):
        _keys(path, jar, SEED_JAR_KEYS, f"jar {i}")
    if not any(jar["id"] == "tax" and jar["type"] == "tax" for jar in jars):
        raise ImportProblem(path, 'the seed has no Tax Jar (a jar with id "tax" and type "tax")')
    if not isinstance(seed["transactions"], list):
        raise ImportProblem(path, "the seed's transactions must be a list")
    for i, tx in enumerate(seed["transactions"]):
        _keys(path, tx, SEED_TRANSACTION_KEYS, f"transaction {i}")
    return seed


def check_scenarios(path) -> list:
    scenarios = _non_empty_list(path, read_json(path), "the scenario list")
    for i, scenario in enumerate(scenarios):
        _keys(path, scenario, SCENARIO_KEYS, f"scenario {i}")
    ids = [s["id"] for s in scenarios]
    if len(set(ids)) != len(ids):
        raise ImportProblem(path, "scenario ids must be unique")
    return scenarios
