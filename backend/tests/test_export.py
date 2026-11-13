"""Task C5: CSV export for an accountant."""

import csv
import io
from datetime import datetime, timezone

from helpers import ACME, simulate, undo


def _rows(response):
    return list(csv.reader(io.StringIO(response.content.decode("utf-8-sig"))))


def test_csv_export(client, onboarded):
    simulate(client, ACME)
    response = client.get("/api/tax/export.csv")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert response.headers["content-disposition"] == 'attachment; filename="tax-jar.csv"'
    today = datetime.now(timezone.utc).date().isoformat()
    lines = response.content.decode("utf-8-sig").splitlines()
    assert lines[0] == (
        "date,payer,reference,source_amount,source_currency,tax_rate_percent,fx_rate,reserved_amount,tax_currency,status"
    )
    assert lines[1] == f"{today},Acme Inc.,INV-042,300.00,USD,20,0.92,276.00,EUR,reserved"


def test_csv_quotes_commas(client, onboarded):
    simulate(client, {"senderName": "Smith, Jones Ltd", "amount": 50000, "currency": "EUR", "reference": "invoice 9"})
    rows = _rows(client.get("/api/tax/export.csv"))
    assert rows[1][1] == "Smith, Jones Ltd"
    assert len(rows[1]) == 10


def test_csv_keeps_undone_rows(client, onboarded):
    acme = simulate(client, ACME)
    undo(client, acme["id"])
    rows = _rows(client.get("/api/tax/export.csv"))
    assert rows[1][-1] == "undone"


def test_csv_rate_without_trailing_zeros(client, onboarded):
    client.put(
        "/api/tax-profile",
        json={"country": "EE", "regime": "fie", "rate": 2250, "taxCurrency": "EUR", "enabled": True},
    )
    simulate(client, ACME)
    assert _rows(client.get("/api/tax/export.csv"))[1][5] == "22.5"


def test_csv_header_only_when_empty(client):
    lines = client.get("/api/tax/export.csv").content.decode("utf-8-sig").splitlines()
    assert len(lines) == 1
