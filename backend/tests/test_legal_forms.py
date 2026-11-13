import pytest

from app.engine.legal_forms import has_legal_form


@pytest.mark.parametrize(
    "name",
    ["Acme Inc.", "Acme Inc", "Brightside ltd.", "Nordwind GmbH", "Kaselaane Puit AS", "Pizza Kiosk OÜ", "Acme LLC"],
)
def test_company_names(name):
    assert has_legal_form(name)


PEOPLE = [
    "John Smith", "Astrid Laanemets", "Sia Kask", "Alas Tamm", "ASTRID LAANE", "Incze Peter", "Mari Tamm",
    "Teo Cruz", "Ali Teo", "Aminah bt Rahim", "Nur Aisyah Bt. Ahmad", "Cia Lopez", "Ana Cia", "Pty Smith",
    "Ky Nguyen", "Nguyen Van Ky", "Ay Yilmaz", "Hamid Ay", "Ab Rahman", "Peter Sas", "Ng Bt", "K. D. Lane",
    "MAMADOU BA", "JOAO DA SILVA", "MARIA DA SILVA", "SA YONG", "KIM SE", "HANS AG", "JOSE ME",
    "Maria A. S.", "Anna B. A. Smith", "John S. A. Smith", "J. S. A. Brook", "Rita S. S. Singh",
]


@pytest.mark.parametrize("name", PEOPLE)
def test_person_names(name):
    assert not has_legal_form(name)


@pytest.mark.parametrize("name", ["AS Kaselaane Vesi", "SIA Bralis Koks", "UAB Gintaro Namai", "Pohjanmeri Oyj", "Koivula Oy", "ACME GMBH", "Modry Mlyn a.s.", "Zeleny Dvur s.r.o.", "Rossomare S.p.A.", "Colline Srl", "Nordhavn ApS", "Nordhavn A/S", "Zeleny Dvur s.r.o", "Kowalski Sp. z o.o.", "Pizza Kiosk OU", "Acme Ltd (UK)"])
def test_leading_and_upper_case_designators(name):
    assert has_legal_form(name)


def test_designator_alone_or_in_the_middle_does_not_count():
    assert not has_legal_form("Limited")
    assert not has_legal_form("Peter Ltd Smith")


def test_token_must_be_a_whole_word():
    assert not has_legal_form("Acme Incorporatedx")
    assert not has_legal_form("Limitedson Peter")
