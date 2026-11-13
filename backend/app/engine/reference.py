"""Structural analysis of a payment reference. No vocabulary, only shape and checksums."""
import re
from dataclasses import dataclass
from datetime import date

_RF_START = re.compile(r"(?<![A-Z0-9])RF\d{2}")
_ALNUM_GROUP = re.compile(r" ?([0-9A-Z]+)")
_DIGITS = re.compile(r"(?<!\d)\d{8,20}(?!\d)")
_IBAN = re.compile(r"(?<![A-Za-z0-9])[A-Za-z]{2}\d{2}(?: ?[A-Za-z0-9]{4}){2,7}(?: ?[A-Za-z0-9]{1,3})?(?![A-Za-z0-9])")
# upper-case prefix + separator + number, e.g. INV-042, PO/17
_PREFIXED_UPPER = re.compile(r"(?<![A-Za-z0-9])[A-Z]{2,6}[-/_]\d+(?![A-Za-z0-9])")
# any-case prefix + separator + a longer number, e.g. inv-042
_PREFIXED_LONG = re.compile(r"(?<![A-Za-z0-9])[A-Za-z]{1,6}[-/_]\d{3,}(?![A-Za-z0-9])")
# prefix glued to a number, e.g. INV042 (an account number is far longer)
_GLUED = re.compile(r"(?<![A-Za-z0-9])[A-Za-z]{2,6}\d{3,10}(?![A-Za-z0-9])")
# hash sign and a number of two or more digits, e.g. #123
_HASHED = re.compile(r"(?<![A-Za-z0-9])#\s?\d{2,}")
# year and sequence, e.g. 2026-118 or 2026/0042
_YEAR_SEQ = re.compile(r"(?<![\d-])(?:19|20)\d{2}[-/](\d{1,6})(?![\d-])")
_ISO_DATE = re.compile(r"(?<!\d)(?:19|20)\d{2}-\d{2}-\d{2}(?!\d)")
_DMY_DATE = re.compile(r"(?<!\d)\d{1,2}[./]\d{1,2}[./](?:19|20)?\d{2}(?!\d)")


@dataclass(frozen=True)
class ReferenceInfo:
    empty: bool
    rf_reference: bool        # ISO 11649 creditor reference with a valid mod-97 check
    numeric_reference: bool   # long numeric reference with a valid 7-3-1 check digit
    document_number: bool     # looks like an invoice or order number


def _rf_valid(compact: str) -> bool:
    rearranged = compact[4:] + compact[:4]
    digits = "".join(str(int(c, 36)) for c in rearranged)
    return int(digits) % 97 == 1


def _has_rf_reference(upper: str) -> bool:
    """Find an RF reference printed either compactly or in space-separated groups."""
    for start in _RF_START.finditer(upper):
        compact, position = start.group(), start.end()
        while len(compact) <= 25:
            if len(compact) > 4 and _rf_valid(compact):
                return True
            group = _ALNUM_GROUP.match(upper, position)
            if not group:
                break
            compact += group.group(1)
            position = group.end()
    return False


def _check_731(number: str) -> bool:
    weights = (7, 3, 1)
    body, check = number[:-1], int(number[-1])
    total = sum(int(d) * weights[i % 3] for i, d in enumerate(reversed(body)))
    return (10 - total % 10) % 10 == check


def _year_seq_is_real(text: str) -> bool:
    for m in _YEAR_SEQ.finditer(text):
        seq = m.group(1)
        # "2026-03" reads as a year and month, not as a document number
        if len(seq) <= 2 and 1 <= int(seq) <= 12:
            continue
        return True
    return False


def analyze_reference(reference: str) -> ReferenceInfo:
    text = (reference or "").strip()
    if not text:
        return ReferenceInfo(True, False, False, False)

    rf = _has_rf_reference(text.upper())
    numeric = any(_check_731(m.group()) for m in _DIGITS.finditer(text))

    without_dates = _IBAN.sub(" ", _DMY_DATE.sub(" ", _ISO_DATE.sub(" ", text)))
    document = not rf and bool(
        _PREFIXED_UPPER.search(without_dates)
        or _PREFIXED_LONG.search(without_dates)
        or _GLUED.search(without_dates)
        or _HASHED.search(without_dates)
        or _year_seq_is_real(without_dates)
    )
    return ReferenceInfo(False, rf, numeric, document)
