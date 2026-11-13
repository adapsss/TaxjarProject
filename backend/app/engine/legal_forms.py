"""Legal-entity designators, loaded from legal_forms.json (data, not code).

A designator counts only where company names actually carry it: as the last
words of the name, or as the first words for designators written without
punctuation ("AS Tallinna Vesi", "Acme GmbH"). Designators written with
punctuation ("a.s.", "A/S") must appear at the end exactly as written. A designator in the middle of a
name, or a name that is nothing but a designator, never counts.

Short upper-case designators ("AS", "SA", "AB") are matched case-sensitively.
When the whole name is printed in capitals, case carries no information, so
designators of one or two letters are ignored there.
"""
import json
import re
from functools import lru_cache
from pathlib import Path

from .names import normalize_name

_FILE = Path(__file__).with_name("legal_forms.json")
_PUNCT = re.compile(r"[^\w\s]", re.UNICODE)
_TRAILING_NOTE = re.compile(r"\s*\([^()]*\)\s*$")


def _words(text: str) -> tuple:
    return tuple(_PUNCT.sub(" ", text).split())


def _literal(text: str) -> str:
    return " ".join(text.split()).rstrip(". ")


@lru_cache(maxsize=1)
def _forms() -> tuple:
    """Split designators into plain ones (matched by words) and punctuated ones (matched literally)."""
    with _FILE.open(encoding="utf-8") as f:
        raw = json.load(f)["forms"]
    plain, punctuated = [], []
    for form in raw:
        sensitive = bool(form.get("caseSensitive"))
        token = form["token"] if sensitive else normalize_name(form["token"])
        if _PUNCT.search(_literal(token)):
            punctuated.append((_literal(token), sensitive))
            continue
        words = _words(token)
        if words:
            plain.append((words, sensitive, sum(len(w) for w in words)))
    return tuple(plain), tuple(punctuated)


def has_legal_form(name: str) -> bool:
    """True when the name starts or ends with a legal-entity designator."""
    name = _TRAILING_NOTE.sub("", name or "")     # "Acme Ltd (UK)" -> "Acme Ltd"
    plain, punctuated = _forms()
    exact = _words(name)
    folded = _words(normalize_name(name))
    all_caps = not any(c.islower() for c in name)
    for words, sensitive, letters in plain:
        if sensitive and all_caps and letters <= 2:
            continue
        have = exact if sensitive else folded
        size = len(words)
        if len(have) > size and (have[-size:] == words or have[:size] == words):
            return True
    # "a.s.", "A/S", "S.p.A.": only the exact written form at the end of the name,
    # so a person's initials ("Maria A. S.") are not mistaken for a designator
    exact_tail = _literal(name)
    folded_tail = _literal(normalize_name(name))
    for token, sensitive in punctuated:
        tail = exact_tail if sensitive else folded_tail
        if tail.endswith(" " + token):
            return True
    return False
