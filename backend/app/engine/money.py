"""Formatting of minor-unit amounts. Only reports and the UI leave minor units."""

# ISO 4217 minor-unit exponents that differ from 2
_EXPONENTS = {
    "BHD": 3, "KWD": 3, "JOD": 3, "OMR": 3, "TND": 3,
    "JPY": 0, "KRW": 0, "CLP": 0, "ISK": 0, "VND": 0, "UGX": 0, "PYG": 0,
}


def exponent(currency: str) -> int:
    return _EXPONENTS.get((currency or "").upper(), 2)


def format_minor(amount: int, currency: str) -> str:
    """Major-unit string with the currency's own number of decimals: 30000 USD -> "300.00"."""
    if amount is None:
        return ""
    digits = exponent(currency)
    sign = "-" if amount < 0 else ""
    whole, fraction = divmod(abs(amount), 10 ** digits)
    return "%s%d" % (sign, whole) if digits == 0 else "%s%d.%0*d" % (sign, whole, digits, fraction)


def format_rate_percent(rate_bp: int) -> str:
    """Basis points as a percentage without trailing zeros: 2000 -> "20", 2250 -> "22.5"."""
    sign = "-" if rate_bp < 0 else ""
    whole, fraction = divmod(abs(rate_bp), 100)
    return sign + (str(whole) if fraction == 0 else ("%d.%02d" % (whole, fraction)).rstrip("0"))
