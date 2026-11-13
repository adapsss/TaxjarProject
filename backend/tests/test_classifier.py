"""Task C1: classifier. owner_name is "Kadri Saar" in every case."""

import pytest

from app.engine.classifier import classify, infer_kind, normalize_name

OWNER = "Kadri Saar"

CASES = [  # sender, kind, amount, reference, payer_status, label, score
    ("Acme Inc.",         None,     150000, "INV-042",                None,       "income",   100),
    ("Mari Tamm",         "person",   2300, "pizza 🍕",               None,       "personal",   0),
    ("John Smith",        None,      40000, "website",                None,       "unknown",   45),
    ("Kaselaane Puit AS", None,      10000, "",                       None,       "unknown",   75),
    ("Astrid Laanemets",  None,      10000, "",                       None,       "personal",  30),
    ("Sia Kask",          None,      10000, "",                       None,       "personal",  30),
    ("Peeter Paju",       "person",  30000, "invoice website",        None,       "income",    80),
    ("Peeter Paju",       "person",   2000, "INV-7",                  None,       "unknown",   40),
    ("Peeter Paju",       "person",   2000, "website",                None,       "personal",  20),
    ("Nordwind GmbH",     None,     220000, "Rechnung 2026-118",      None,       "income",   100),
    ("Brightside ltd.",   None,      90000, "consulting March",       None,       "income",    90),
    ("Brightside ltd.",   None,       3000, "consulting",             None,       "income",    90),
    ("Pizza Kiosk OÜ",    None,      10000, "pizza",                  None,       "personal",  35),
    ("Liis Kask",         "person",  10000, "order #123",             None,       "unknown",   65),
    ("Liis Kask",         "person",   6000, "dinner split",           None,       "personal",   0),
    ("Liis Kask",         "person",  10000, "website design project", None,       "unknown",   45),
    ("John Smith",        None,       1000, "pizza",                  "client",   "income",   100),
    ("Acme Inc.",         None,     150000, "INV-042",                "personal", "personal",   0),
    ("  kadri   SAAR ",   None,      20000, "invoice",                None,       "personal",   0),
]


@pytest.mark.parametrize("sender, kind, amount, reference, status, label, score", CASES)
def test_cases(sender, kind, amount, reference, status, label, score):
    result = classify(
        sender_name=sender, sender_kind=kind, amount=amount, reference=reference,
        owner_name=OWNER, payer_status=status,
    )
    assert (result.label, result.score) == (label, score)


def _classify(sender, kind=None, amount=10000, reference="", status=None):
    return classify(
        sender_name=sender, sender_kind=kind, amount=amount, reference=reference,
        owner_name=OWNER, payer_status=status,
    )


def test_acme_reasons():
    assert _classify("Acme Inc.", amount=150000, reference="INV-042").reasons == ["company sender", "invoice in reference"]


def test_learned_confidence():
    assert _classify("John Smith", status="client").confidence == 0.99


def test_personal_confidence_is_inverted():
    assert _classify("Mari Tamm", "person", 2300, "pizza 🍕").confidence == 1.0


def test_unknown_confidence_is_the_score():
    assert _classify("John Smith", amount=40000, reference="website").confidence == 0.45


def test_sp_z_oo_is_a_company():
    assert infer_kind("Kowalski Sp. z o.o.", None) == "company"


def test_normalize_name():
    assert normalize_name("  kadri   SAAR ") == "kadri saar"


def test_explicit_kind_wins():
    assert infer_kind("Acme Inc.", "person") == "person"
