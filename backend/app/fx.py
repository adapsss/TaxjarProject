"""Fixed FX rates for the demo. Amounts are integers in minor units (cents).

Rates are basis points of EUR per one unit of the currency, so the demo never
depends on an external rate service. USD at 9200 is what makes the hero case
read "€276 set aside": $1,500 x 20% = $300 -> €276.
"""

TO_EUR_BP = {"EUR": 10000, "USD": 9200, "GBP": 11500}


class UnsupportedCurrency(ValueError):
    def __init__(self, currency: str):
        super().__init__(f"Unsupported currency: {currency}")
        self.currency = currency


def is_supported(currency: str) -> bool:
    return currency in TO_EUR_BP


def _bp(currency: str) -> int:
    try:
        return TO_EUR_BP[currency]
    except (KeyError, TypeError):
        raise UnsupportedCurrency(currency) from None


def rate(src: str, dst: str) -> float:
    """Display-only rate: how many units of dst one unit of src buys."""
    return _bp(src) / _bp(dst)


def convert(amount: int, src: str, dst: str) -> int:
    """Convert minor units of src into minor units of dst, rounding half up.

    Integer maths only. The cross rate goes through EUR as a single ratio, so
    there is one rounding step, not two.
    """
    src_bp, dst_bp = _bp(src), _bp(dst)
    if not isinstance(amount, int) or isinstance(amount, bool):
        raise ValueError("amount must be an integer in minor units")
    if amount < 0:
        raise ValueError("amount must not be negative")
    return (2 * amount * src_bp + dst_bp) // (2 * dst_bp)
