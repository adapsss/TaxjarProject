"""Task D2: every demo scenario classifies as the simulator expects."""

from invariants import assert_invariants

FIELDS = ("senderName", "senderKind", "amount", "currency", "reference")


def test_every_scenario_classifies_as_expected(client, session, onboarded):
    scenarios = client.get("/api/demo/scenarios").json()  # stored in the database
    assert {s["id"] for s in scenarios} >= {"acme", "mari", "john"}
    for scenario in scenarios:
        body = {k: scenario[k] for k in FIELDS if k in scenario}
        response = client.post("/api/simulate/incoming", json=body)
        assert response.status_code == 200, (scenario["id"], response.text)
        assert response.json()["classification"]["label"] == scenario["expect"], scenario["id"]
    assert_invariants(session)
