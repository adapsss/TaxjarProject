import pytest

from app import fx


def test_usd_to_eur():
    assert fx.convert(30000, "USD", "EUR") == 27600


def test_gbp_to_eur():
    assert fx.convert(18000, "GBP", "EUR") == 20700


def test_same_currency():
    assert fx.convert(8000, "EUR", "EUR") == 8000


def test_cross_via_eur():
    assert fx.convert(10000, "USD", "GBP") == 8000


def test_rounds_half_up():
    # 1 USD cent = 0.92 EUR cent -> 1; 25 USD cents = 23.0; 13 USD cents = 11.96 -> 12
    assert fx.convert(1, "USD", "EUR") == 1
    assert fx.convert(13, "USD", "EUR") == 12
    # 5 EUR cents -> USD: 5 / 0.92 = 5.43 -> 5; 6 EUR cents -> 6.52 -> 7
    assert fx.convert(5, "EUR", "USD") == 5
    assert fx.convert(6, "EUR", "USD") == 7


def test_zero_amount():
    assert fx.convert(0, "USD", "EUR") == 0


def test_negative_amount_is_rejected():
    with pytest.raises(ValueError):
        fx.convert(-1, "USD", "EUR")


@pytest.mark.parametrize("amount", [1.5, "100", True, None])
def test_non_integer_amount_is_rejected(amount):
    with pytest.raises(ValueError):
        fx.convert(amount, "USD", "EUR")


def test_unsupported():
    with pytest.raises(fx.UnsupportedCurrency):
        fx.convert(100, "JPY", "EUR")
    with pytest.raises(fx.UnsupportedCurrency):
        fx.convert(100, "EUR", "JPY")


def test_unsupported_is_a_value_error():
    assert issubclass(fx.UnsupportedCurrency, ValueError)


def test_is_supported():
    assert fx.is_supported("EUR")
    assert fx.is_supported("USD")
    assert fx.is_supported("GBP")
    assert not fx.is_supported("JPY")
    assert not fx.is_supported("eur")


def test_display_rate():
    assert fx.rate("USD", "EUR") == 0.92
    assert fx.rate("GBP", "EUR") == 1.15
    assert fx.rate("EUR", "EUR") == 1.0


def test_display_rate_unsupported():
    with pytest.raises(fx.UnsupportedCurrency):
        fx.rate("JPY", "EUR")
