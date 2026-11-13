"""Demo payloads and small readers shared by the API tests."""

ACME = {"senderName": "Acme Inc.", "amount": 150000, "currency": "USD", "reference": "INV-042"}
MARI = {"senderName": "Mari Tamm", "senderKind": "person", "amount": 2300, "currency": "EUR", "reference": "pizza 🍕"}
JOHN = {"senderName": "John Smith", "amount": 40000, "currency": "EUR", "reference": "website"}
ONBOARDING = {"country": "EE", "regime": "entrepreneur_account", "rate": 2000, "taxCurrency": "EUR", "enabled": True}


def simulate(client, body: dict) -> dict:
    response = client.post("/api/simulate/incoming", json=body)
    assert response.status_code == 200, response.text
    return response.json()


def answer(client, tx_id: str, is_income: bool):
    return client.post(f"/api/transactions/{tx_id}/answer", json={"isIncome": is_income})


def undo(client, tx_id: str):
    return client.post(f"/api/transactions/{tx_id}/undo")


def balance(client, currency: str) -> int:
    account = client.get("/api/account").json()
    return next(b["amount"] for b in account["balances"] if b["currency"] == currency)


def tax_jar(client) -> dict:
    account = client.get("/api/account").json()
    return next(j for j in account["jars"] if j["id"] == "tax")


def event_types(events) -> list:
    return [event_type for event_type, _ in events]
