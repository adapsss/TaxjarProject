"""Legal-entity designators, read from the database (engine.data; data, not code).

A designator counts only where company names actually carry it: as the last
words of the name, or as the first words for designators written without
punctuation ("AS Tallinna Vesi", "Acme GmbH"). Designators written with
punctuation ("a.s.", "A/S") must appear at the end exactly as written. A designator in the middle of a
name, or a name that is nothing but a designator, never counts.

Short upper-case designators ("AS", "SA", "AB") are matched case-sensitively.
When the whole name is printed in capitals, case carries no information, so
case-sensitive designators of up to four letters are ignored there unless the
data marks them `capsSafe` (not also a common surname or name particle: "AG",
"AB", "OY", but not "BA" or "SAM"), and only `capsLeading` ones may lead.
"""
import re
import threading

from . import data
from .names import normalize_name

_PUNCT = re.compile(r"[^\w\s]", re.UNICODE)
_TRAILING_NOTE = re.compile(r"\s*\([^()]*\)\s*$")


def _words(text: str) -> tuple:
    return tuple(_PUNCT.sub(" ", text).split())


def _literal(text: str) -> str:
    return " ".join(text.split()).rstrip(". ")


_compiled_lock = threading.Lock()
_compiled = (None, None)  # (the TaxData it was built from, the split forms)


def _forms() -> tuple:
    """The current forms, split for matching; rebuilt only when the tax data was re-read."""
    global _compiled
    current = data.current()
    with _compiled_lock:
        source, split = _compiled
        if source is not current:
            split = _split(current.legal_forms)
            _compiled = (current, split)
        return split


def _split(raw) -> tuple:
    """Split designators into plain ones (matched by words) and punctuated ones (matched literally)."""
    plain, punctuated = [], []
    for form in raw:
        sensitive = bool(form.get("caseSensitive"))
        token = form["token"] if sensitive else normalize_name(form["token"])
        if _PUNCT.search(_literal(token)):
            punctuated.append((_literal(token), sensitive))
            continue
        words = _words(token)
        if words:
            plain.append((words, sensitive, sum(len(w) for w in words),
                          bool(form.get("capsSafe")), bool(form.get("capsLeading"))))
    return tuple(plain), tuple(punctuated)


def has_legal_form(name: str) -> bool:
    """True when the name starts or ends with a legal-entity designator."""
    name = _TRAILING_NOTE.sub("", name or "")     # "Acme Ltd (UK)" -> "Acme Ltd"
    plain, punctuated = _forms()
    exact = _words(name)
    folded = _words(normalize_name(name))
    all_caps = not any(c.islower() for c in name)
    for words, sensitive, letters, caps_safe, caps_leading in plain:
        doubtful = sensitive and all_caps and letters <= 4
        if doubtful and not caps_safe:
            continue
        have = exact if sensitive else folded
        size = len(words)
        if len(have) <= size:
            continue
        if have[-size:] == words:
            return True
        if have[:size] == words and (caps_leading or not doubtful):
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
