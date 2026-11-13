from datetime import datetime, timedelta

import pytest

from app.engine.classifier import ASK_AT, RESERVE_AT, OwnerContext, PriorPayment, classify, infer_kind

OWNER = "Kadri Saar"
NOW = datetime(2026, 11, 13, 12, 0)


def run(sender, kind, amount, reference, payer_status=None, **extra):
    return classify(
        sender_name=sender,
        sender_kind=kind,
        amount=amount,
        reference=reference,
        owner_name=OWNER,
        payer_status=payer_status,
        **extra,
    )


def monthly(count, amount=40000):
    return [PriorPayment(NOW - timedelta(days=30 * i), amount, "EUR") for i in range(count, 0, -1)]


# sender, kind, amount, reference, expected label
CASES = [
    ("Acme Inc.", None, 150000, "INV-042", "income"),
    ("Nordwind GmbH", None, 220000, "Rechnung 2026-118", "income"),
    ("John Smith", None, 123456, "RF18 5390 0754 7034", "income"),
    ("John Smith", None, 40000, "website", "unknown"),
    ("Kaselaane Puit AS", None, 10000, "", "unknown"),
    ("Brightside ltd.", None, 3000, "March", "unknown"),
    ("Peeter Paju", "person", 30000, "INV-7", "unknown"),
    ("Mari Tamm", "person", 2300, "thanks", "personal"),
    ("Astrid Laanemets", None, 10000, "", "personal"),
    ("Sia Kask", None, 9000, "", "personal"),
    ("Liis Kask", "person", 6000, "dinner", "personal"),
]


# the demo scenarios from the role D plan; the wording of the reference is irrelevant to the engine
DEMO = [
    ("Acme Inc.", None, 150000, "INV-042", "income"),
    ("Mari Tamm", "person", 2300, "pizza", "personal"),
    ("John Smith", None, 40000, "website", "unknown"),
    ("Nordwind GmbH", None, 220000, "Rechnung 2026-118", "income"),
    ("Pihlakas Disain O\u00dc", None, 64000, "arve 77", "income"),
    ("Liis Kask", "person", 1200, "beer", "personal"),
    ("Kadri Saar", None, 20000, "between my accounts", "personal"),
    ("Brightside Ltd", None, 90000, "consulting March", "income"),
]


@pytest.mark.parametrize("sender,kind,amount,reference,label", DEMO)
def test_demo_scenarios(sender, kind, amount, reference, label):
    assert run(sender, kind, amount, reference).label == label


@pytest.mark.parametrize("sender,kind,amount,reference,label", CASES)
def test_case_table(sender, kind, amount, reference, label):
    assert run(sender, kind, amount, reference).label == label


def test_label_follows_thresholds():
    for sender, kind, amount, reference, _ in CASES:
        result = run(sender, kind, amount, reference)
        expected = "income" if result.score >= RESERVE_AT else "unknown" if result.score >= ASK_AT else "personal"
        assert result.label == expected
        assert 0 <= result.score <= 100


def test_reasons_name_the_evidence():
    assert run("Acme Inc.", None, 150000, "INV-042").reasons == ["company sender", "invoice in reference"]


def test_wording_of_the_reference_does_not_matter():
    """Two free-text references of the same shape score the same: there is no vocabulary."""
    a = run("John Smith", None, 40000, "website")
    b = run("John Smith", None, 40000, "birthday")
    assert (a.label, a.score) == (b.label, b.score)


def test_own_account_transfer():
    result = run("  kadri   SAAR ", None, 20000, "INV-1")
    assert (result.label, result.score, result.confidence) == ("personal", 0, 0.99)
    assert result.reasons == ["transfer between your own accounts"]


def test_learned_client_overrides_inference():
    result = run("Mari Tamm", "person", 1000, "thanks", "client")
    assert (result.label, result.score, result.confidence) == ("income", 100, 0.99)


def test_learned_personal_overrides_inference():
    result = run("Acme Inc.", None, 150000, "INV-042", "personal")
    assert (result.label, result.score) == ("personal", 0)


def test_own_account_beats_learned_status():
    assert run("Kadri Saar", None, 20000, "", "client").label == "personal"


def test_personal_confidence_is_inverted():
    result = run("Mari Tamm", "person", 2300, "thanks")
    assert result.confidence == pytest.approx(1 - result.score / 100)


def test_declared_person_with_company_name_still_counts_as_company():
    result = run("Acme OÜ", "person", 10000, "")
    assert "company sender" in result.reasons
    assert result.label != "personal"


def test_company_is_not_discounted_for_a_small_amount():
    assert run("Brightside ltd.", None, 3000, "").score == run("Brightside ltd.", None, 5000, "").score


def test_repeat_payer_raises_the_score():
    first = run("John Smith", None, 40000, "website")
    repeat = run("John Smith", None, 40000, "website", history=monthly(1), now=NOW)
    assert repeat.score > first.score
    assert "this payer has paid you before" in repeat.reasons


def test_regular_schedule_turns_a_question_into_income():
    result = run("John Smith", None, 40000, "website", history=monthly(3), now=NOW)
    assert result.label == "income"
    assert "payments arrive on a regular schedule" in result.reasons


def test_irregular_history_is_not_called_regular():
    history = [PriorPayment(NOW - timedelta(days=d), 40000, "EUR") for d in (200, 190, 20)]
    assert "payments arrive on a regular schedule" not in run(
        "John Smith", None, 40000, "website", history=history, now=NOW
    ).reasons


def test_amount_is_judged_against_the_owner():
    small_earner = OwnerContext(home_currency="EUR", typical_income_minor=20000)
    big_earner = OwnerContext(home_currency="EUR", typical_income_minor=500000)
    assert run("John Smith", None, 40000, "x", owner=small_earner).score > run(
        "John Smith", None, 40000, "x", owner=big_earner
    ).score


def test_foreign_currency_is_evidence():
    owner = OwnerContext(home_currency="EUR")
    home = run("John Smith", None, 40000, "x", owner=owner, currency="EUR")
    abroad = run("John Smith", None, 40000, "x", owner=owner, currency="USD")
    assert abroad.score > home.score
    assert "paid in a foreign currency" in abroad.reasons


@pytest.mark.parametrize("amount", [0, -1, -5000])
def test_non_positive_amount_is_never_income(amount):
    result = run("Acme Ltd", "company", amount, "INV-12 RF18 5390 0754 7034")
    assert (result.label, result.score) == ("personal", 0)


def test_score_never_drops_as_the_amount_grows():
    for sender, kind, reference in [("Anna Berg", None, ""), ("Anna Berg", "person", "INV-12"), ("Acme Ltd", None, "")]:
        scores = [run(sender, kind, a, reference).score for a in range(100, 300000, 37)]
        assert scores == sorted(scores)


def test_aware_and_naive_timestamps_mix():
    from datetime import timezone

    aware_now = NOW.replace(tzinfo=timezone.utc)
    assert run("John Smith", None, 40000, "website", history=monthly(3), now=aware_now).label == "income"


def test_missing_reference_is_treated_as_empty():
    assert run("John Smith", None, 40000, None).score == run("John Smith", None, 40000, "").score


def test_deterministic():
    assert run("John Smith", None, 40000, "website") == run("John Smith", None, 40000, "website")


def test_infer_kind():
    assert infer_kind("Acme Inc.", None) == "company"
    assert infer_kind("John Smith", None) == "unknown"
    assert infer_kind("John Smith", "person") == "person"
    assert infer_kind("John Smith", "company") == "company"
    assert infer_kind("Sia Kask", None) == "unknown"
    assert infer_kind("Acme GmbH", "person") == "company"
