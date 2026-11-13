from datetime import date, datetime

from app.engine import DISCLAIMER, build_summary, export_rows, format_minor, format_rate_percent, to_csv


def reservation(**overrides):
    row = {
        "status": "reserved", "created_at": datetime(2026, 11, 13, 9, 30), "payer": "Acme Inc.",
        "reference": "INV-042", "source_amount": 30000, "source_currency": "USD", "rate_bp": 2000,
        "fx_rate": 0.92, "reserved_amount": 27600, "tax_currency": "EUR",
    }
    row.update(overrides)
    return row


def summary(rows, today=date(2026, 11, 13)):
    return build_summary(rows, tax_currency="EUR", country="EE", regime="entrepreneur_account", today=today)


def test_summary_totals():
    rows = [reservation(), reservation(reserved_amount=8000, source_amount=8000, source_currency="EUR", fx_rate=1.0)]
    result = summary(rows)
    assert result["total_reserved"] == result["estimated_due"] == 35600
    assert result["total_paid"] == 0
    assert result["by_month"] == [{"month": "2026-11", "reserved": 35600}]
    assert result["tax_currency"] == "EUR"
    assert result["disclaimer"] == DISCLAIMER == "An estimate for setting money aside, not tax advice."


def test_undone_is_excluded():
    result = summary([reservation(status="undone")])
    assert (result["total_reserved"], result["by_month"]) == (0, [])


def test_paid_counts_separately_but_stays_in_its_month():
    rows = [reservation(status="paid", created_at=datetime(2026, 9, 2)), reservation(reserved_amount=1000)]
    result = summary(rows)
    assert (result["total_reserved"], result["total_paid"]) == (1000, 27600)
    assert result["by_month"] == [{"month": "2026-09", "reserved": 27600}, {"month": "2026-11", "reserved": 1000}]


def test_empty_summary():
    result = summary([])
    assert (result["total_reserved"], result["total_paid"], result["by_month"]) == (0, 0, [])
    assert result["disclaimer"]


def test_deadline_follows_regime():
    assert summary([])["next_deadline"] == date(2026, 12, 10)
    assert build_summary([], tax_currency="EUR", country="*", regime="custom", today=date(2026, 11, 13))["next_deadline"] is None
    assert build_summary([], tax_currency="EUR", country=None, regime=None, today=date(2026, 11, 13))["next_deadline"] is None


def test_records_can_be_objects():
    class Row:
        status, reserved_amount, created_at = "reserved", 500, datetime(2026, 1, 5)

    assert summary([Row()])["total_reserved"] == 500


def test_csv_export_line():
    text = to_csv(export_rows([reservation()]))
    lines = text.splitlines()
    assert lines[0] == "date,payer,reference,source_amount,source_currency,tax_rate_percent,fx_rate,reserved_amount,tax_currency,status"
    assert lines[1] == "2026-11-13,Acme Inc.,INV-042,300.00,USD,20,0.92,276.00,EUR,reserved"


def test_csv_quotes_commas():
    text = to_csv(export_rows([reservation(payer="Smith, Jones Ltd")]))
    assert '"Smith, Jones Ltd"' in text
    assert len(text.splitlines()) == 2


def test_csv_header_only_when_empty():
    assert len(to_csv(export_rows([])).splitlines()) == 1


def test_csv_is_oldest_first_and_keeps_every_status():
    rows = export_rows([
        reservation(status="undone", created_at=datetime(2026, 11, 2)),
        reservation(status="paid", created_at=datetime(2026, 10, 1)),
    ])
    assert [r[0] for r in rows[1:]] == ["2026-10-01", "2026-11-02"]
    assert [r[-1] for r in rows[1:]] == ["paid", "undone"]


def test_amount_formatting_follows_the_currency():
    assert format_minor(30000, "USD") == "300.00"
    assert format_minor(5, "EUR") == "0.05"
    assert format_minor(1500, "JPY") == "1500"
    assert format_minor(1500, "KWD") == "1.500"
    assert format_minor(-250, "EUR") == "-2.50"


def test_rate_formatting():
    assert [format_rate_percent(r) for r in (2000, 2250, 2205, 0, 50)] == ["20", "22.5", "22.05", "0", "0.5"]


def test_incomplete_rows_do_not_crash_the_export():
    rows = export_rows([reservation(reserved_amount=None, source_amount=None, payer=None, fx_rate=None)])
    assert rows[1][1] == "" and rows[1][3] == "" and rows[1][6] == "" and rows[1][7] == ""


def test_aware_and_naive_timestamps_sort_together_in_utc():
    from datetime import timedelta, timezone

    late = datetime(2026, 9, 30, 23, 0, tzinfo=timezone(timedelta(hours=-5)))
    rows = [reservation(created_at=late), reservation(created_at=datetime(2026, 9, 30, 12, 0))]
    assert [r[0] for r in export_rows(rows)[1:]] == ["2026-09-30", "2026-10-01"]
    assert [m["month"] for m in summary(rows)["by_month"]] == ["2026-09", "2026-10"]


def test_spreadsheet_formulas_are_neutralised():
    rows = export_rows([reservation(payer="=1+1", reference="@cmd")])
    assert rows[1][1] == "'=1+1" and rows[1][2] == "'@cmd"


def test_negative_rate_formatting():
    assert format_rate_percent(-250) == "-2.5"
