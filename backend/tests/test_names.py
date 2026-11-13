from app.engine.names import normalize_name, same_party


def test_normalize_name():
    assert normalize_name("  kadri   SAAR ") == "kadri saar"


def test_same_party_ignores_case_order_and_diacritics():
    assert same_party("  kadri   SAAR ", "Kadri Saar")
    assert same_party("Saar, Kadri", "Kadri Saar")
    assert same_party("Jüri Pärn", "Juri Parn")


def test_different_people_do_not_match():
    assert not same_party("Kadri Saar", "Kadri Saarepuu")
    assert not same_party("Kadri", "Kadri Saar")
    assert not same_party("Anna Anna", "Anna")


def test_empty_names_never_match():
    assert not same_party("", "")
    assert not same_party("  ", "--")
