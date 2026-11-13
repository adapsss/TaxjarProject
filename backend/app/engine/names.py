"""Name normalisation and own-account matching."""
import re
import unicodedata

_PUNCT = re.compile(r"[^\w\s]", re.UNICODE)


def normalize_name(name: str) -> str:
    """NFKC, casefold, trim and collapse inner whitespace."""
    return " ".join(unicodedata.normalize("NFKC", name or "").casefold().split())


def _fold(name: str) -> str:
    """Normalise and strip diacritics and punctuation, for identity comparison only."""
    decomposed = unicodedata.normalize("NFKD", normalize_name(name))
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    return " ".join(_PUNCT.sub(" ", stripped).split())


def name_tokens(name: str) -> tuple:
    return tuple(sorted(_fold(name).split()))


def same_party(a: str, b: str) -> bool:
    """True when two names denote the same party.

    Order-insensitive ("Saar Kadri" == "Kadri Saar"), diacritic-insensitive and
    punctuation-insensitive. Two empty names never match.
    """
    ta, tb = name_tokens(a), name_tokens(b)
    return bool(ta) and ta == tb
