import pytest

from app.engine.reference import analyze_reference


@pytest.mark.parametrize("text", ["INV-042", "INV-7", "inv042", "order #123", "Rechnung 2026-118", "PO/17 thanks"])
def test_document_numbers(text):
    assert analyze_reference(text).document_number


@pytest.mark.parametrize(
    "text",
    ["", "website", "thanks for dinner", "2026-03-15", "15.03.2026", "March 2026-03", "iPhone 15", "covid 19",
     "Covid-19", "Room-12", "Pizza #2", "Gift #1", "A-1", "x/2", "IBAN DE89370400440532013000",
     "DE89 3704 0044 0532 0130 00", "RF18539007547034"]
)
def test_not_document_numbers(text):
    assert not analyze_reference(text).document_number


def test_empty_reference():
    assert analyze_reference("").empty
    assert analyze_reference("   ").empty
    assert not analyze_reference("x").empty


def test_valid_rf_creditor_reference():
    assert analyze_reference("RF18 5390 0754 7034").rf_reference
    assert analyze_reference("payment rf18539007547034").rf_reference


def test_rf_with_wrong_check_digits_is_rejected():
    assert not analyze_reference("RF19 5390 0754 7034").rf_reference


def test_numeric_reference_check_digit():
    # 7-3-1 weights over 12345 give 37, so the check digit is 3
    # 7-3-1 weights over 1234567 give 78, so the check digit is 2
    assert analyze_reference("12345672").numeric_reference
    assert not analyze_reference("12345673").numeric_reference
    assert not analyze_reference("123453").numeric_reference   # too short to trust
