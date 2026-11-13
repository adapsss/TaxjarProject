def test_openapi_lists_every_contract_path(client):
    paths = client.get("/openapi.json").json()["paths"]
    assert set(paths) >= {
        "/api/account", "/api/transactions", "/api/tax-profile", "/api/tax/countries",
        "/api/simulate/incoming", "/api/transactions/{id}/answer", "/api/transactions/{id}/undo",
        "/api/tax/summary", "/api/tax/pay", "/api/tax/export.csv", "/api/demo/reset", "/api/events",
    }


def test_json_is_camel_case(client):
    assert "taxCurrency" in client.get("/api/tax-profile").json()


def test_every_stub_answers_in_contract_shape(client):
    assert client.get("/api/account").json()["owner"] == "Kadri Saar"
    transaction = client.get("/api/transactions").json()[0]
    assert transaction["classification"]["reasons"] == ["company sender", "invoice in reference"]
    assert transaction["reservation"]["reservedAmount"] == 27600
    assert [p["amount"] for p in transaction["reservation"]["breakdown"]] == [11040, 16560]
    body = {"senderName": "Acme Inc.", "amount": 150000, "currency": "USD", "reference": "INV-042"}
    assert client.post("/api/simulate/incoming", json=body).status_code == 200
    assert client.post("/api/transactions/tx-acme/answer", json={"isIncome": True}).status_code == 200
    assert client.post("/api/transactions/tx-acme/undo").status_code == 200
    assert client.post("/api/tax/pay").json()["paidAmount"] == 27600
    assert client.post("/api/demo/reset").status_code == 200
    assert client.get("/api/events").headers["content-type"].startswith("text/event-stream")


def test_countries_come_from_the_engine(client):
    countries = client.get("/api/tax/countries").json()
    estonia = next(c for c in countries if c["code"] == "EE")
    regimes = {r["id"]: r for r in estonia["regimes"]}
    assert set(regimes) == {"entrepreneur_account", "fie"}
    assert regimes["entrepreneur_account"]["defaultRate"] == 2000
    assert regimes["fie"]["breakdownRule"] == "22% income tax on profit + 33% social tax"
    assert countries[-1]["code"] == "*"


def test_summary_and_export_stubs(client):
    summary = client.get("/api/tax/summary").json()
    assert summary["totalReserved"] == 27600
    assert summary["disclaimer"] == "An estimate for setting money aside, not tax advice."
    assert [p["id"] for p in summary["breakdown"]] == ["income_tax", "social_tax"]
    export = client.get("/api/tax/export.csv")
    assert export.headers["content-type"].startswith("text/csv")
    assert "tax-jar.csv" in export.headers["content-disposition"]
    assert export.text.splitlines()[1].startswith("2026-11-13,Acme Inc.,INV-042,300.00,USD,20,0.92,276.00,EUR,reserved")


def test_errors_use_the_contract_format(client):
    missing = client.get("/api/nope")
    assert missing.status_code == 404
    assert set(missing.json()["error"]) == {"code", "message"}
    invalid = client.post("/api/simulate/incoming", json={"amount": "x"})
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "validation_error"
    assert set(invalid.json()) == {"error"}
