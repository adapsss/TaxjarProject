"""Task D2: every demo scenario classifies as the simulator expects."""

import json

from app.db import BACKEND_DIR
from invariants import assert_invariants

SCENARIOS_PATH = BACKEND_DIR.parent / "demo" / "scenarios.json"
FIELDS = ("senderName", "senderKind", "amount", "currency", "reference")


def test_every_scenario_classifies_as_expected(client, session, onboarded):
    scenarios = json.loads(SCENARIOS_PATH.read_text(encoding="utf-8"))
    assert {s["id"] for s in scenarios} >= {"acme", "mari", "john"}
    for scenario in scenarios:
        body = {k: scenario[k] for k in FIELDS if k in scenario}
        response = client.post("/api/simulate/incoming", json=body)
        assert response.status_code == 200, (scenario["id"], response.text)
        assert response.json()["classification"]["label"] == scenario["expect"], scenario["id"]
    assert_invariants(session)
