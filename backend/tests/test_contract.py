"""The frozen API contract. If one of these fails, the contract changed:
talk to the tech lead before touching the test."""

CONTRACT_PATHS = {
    "/api/account": {"get"},
    "/api/transactions": {"get"},
    "/api/tax-profile": {"get", "put"},
    "/api/tax/countries": {"get"},
    "/api/simulate/incoming": {"post"},
    "/api/transactions/{id}/answer": {"post"},
    "/api/transactions/{id}/undo": {"post"},
    "/api/tax/summary": {"get"},
    "/api/tax/pay": {"post"},
    "/api/tax/export.csv": {"get"},
    "/api/demo/reset": {"post"},
    "/api/events": {"get"},
}


def test_openapi_lists_every_contract_path(client):
    paths = client.get("/openapi.json").json()["paths"]
    assert set(paths) >= set(CONTRACT_PATHS)
    for path, methods in CONTRACT_PATHS.items():
        assert methods <= set(paths[path]), path


def test_json_is_camel_case(client):
    assert "taxCurrency" in client.get("/api/tax-profile").json()


def test_stub_transactions_cover_every_state(client):
    txs = client.get("/api/transactions").json()
    labels = {t["classification"]["label"] for t in txs}
    assert labels == {"income", "personal", "unknown"}
    reserved = [t for t in txs if t["reservation"]]
    assert reserved and reserved[0]["reservationId"] == reserved[0]["reservation"]["id"]
    assert all(isinstance(t["amount"], int) for t in txs)


def test_requests_accept_camel_case(client):
    body = {"senderName": "Acme Inc.", "amount": 150000, "currency": "USD", "reference": "INV-042"}
    assert client.post("/api/simulate/incoming", json=body).status_code == 200
    assert client.post("/api/transactions/tx-john/answer", json={"isIncome": True}).status_code == 200
    profile = client.get("/api/tax-profile").json()
    assert client.put("/api/tax-profile", json=profile).status_code == 200


def test_every_json_stub_answers(client):
    for path in ["/api/account", "/api/transactions", "/api/tax-profile", "/api/tax/countries", "/api/tax/summary"]:
        assert client.get(path).status_code == 200, path
    assert client.post("/api/transactions/tx-acme/undo").status_code == 200
    assert client.post("/api/tax/pay").status_code == 200
    assert client.post("/api/demo/reset").status_code == 200


def test_csv_stub(client):
    r = client.get("/api/tax/export.csv")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
