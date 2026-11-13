"""Fixed FX rates for the demo. Amounts are integers in minor units of each currency.

Rates are micro-euros (millionths of a euro) per one major unit of the currency, so the demo
never depends on an external rate service and weak currencies (KRW, COP) still have precision.
They are rounded, illustrative rates, not a market feed. USD at 0.92 is what makes the hero
case read "€276 set aside": $1,500 x 20% = $300 -> €276.

Every currency an engine country uses is listed, so any country's tax currency works.
Minor units follow ISO 4217 (app/engine/money.py): JPY and KRW have none, KWD and BHD have three.
"""

from app.engine.money import exponent

TO_EUR_MICRO = {
    "EUR": 1_000_000,
    "USD": 920_000,
    "GBP": 1_150_000,
    "CHF": 1_060_000,
    "AUD": 600_000,
    "BHD": 2_440_000,
    "BRL": 170_000,
    "CAD": 670_000,
    "CNY": 127_000,
    "CZK": 40_000,
    "DKK": 134_000,
    "GEL": 340_000,
    "HKD": 118_000,
    "HUF": 2_500,
    "ILS": 250_000,
    "INR": 10_800,
    "ISK": 6_700,
    "JPY": 6_100,
    "KRW": 640,
    "KWD": 2_990_000,
    "KYD": 1_100_000,
    "MKD": 16_300,
    "MOP": 114_000,
    "MYR": 200_000,
    "NOK": 86_000,
    "NZD": 550_000,
    "PEN": 245_000,
    "PHP": 16_100,
    "PLN": 232_000,
    "QAR": 253_000,
    "RON": 201_000,
    "SAR": 245_000,
    "SEK": 88_000,
    "SGD": 690_000,
    "THB": 26_000,
    "TWD": 29_000,
    "UYU": 23_000,
    "XCG": 514_000,
    "ZAR": 51_000,
    "ARS": 950,
    "CLP": 980,
    "COP": 220,
    "CRC": 1_800,
}


class UnsupportedCurrency(ValueError):
    def __init__(self, currency: str):
        super().__init__(f"Unsupported currency: {currency}")
        self.currency = currency


def is_supported(currency: str) -> bool:
    return currency in TO_EUR_MICRO


def supported() -> list:
    """Every currency a balance or the Tax Jar can be kept in, EUR first."""
    return list(TO_EUR_MICRO)


def _micro(currency: str) -> int:
    try:
        return TO_EUR_MICRO[currency]
    except (KeyError, TypeError):
        raise UnsupportedCurrency(currency) from None


def rate(src: str, dst: str) -> float:
    """Display-only rate: how many major units of dst one major unit of src buys."""
    value = _micro(src) / _micro(dst)
    return round(value, 6) if value < 1 else round(value, 4)


def convert(amount: int, src: str, dst: str) -> int:
    """Convert minor units of src into minor units of dst, rounding half up.

    Integer maths only. The cross rate goes through EUR as a single ratio, and the two
    currencies' minor-unit exponents are folded into it, so there is one rounding step.
    """
    src_micro, dst_micro = _micro(src), _micro(dst)
    if not isinstance(amount, int) or isinstance(amount, bool):
        raise ValueError("amount must be an integer in minor units")
    if amount < 0:
        raise ValueError("amount must not be negative")
    num = amount * src_micro * 10 ** exponent(dst)
    den = dst_micro * 10 ** exponent(src)
    return (2 * num + den) // (2 * den)
