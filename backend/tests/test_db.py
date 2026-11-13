"""Seed loading, fixtures and row -> schema conversion. Seed values are the fixed ones from Task D1."""

from datetime import datetime, timezone

from sqlmodel import select

from app import db
from app.models import (
    PROFILE_ID,
    TAX_JAR_ID,
    BalanceRow,
    CounterpartyRow,
    JarRow,
    ProfileRow,
    ReservationRow,
    TransactionRow,
)


def test_seed_account(session):
    account = db.to_account(session)
    assert account.owner == "Kadri Saar"
    assert {b.currency: b.amount for b in account.balances} == {"EUR": 245000, "USD": 32000, "GBP": 15000}
    jars = {j.name: j for j in account.jars}
    assert jars["Holiday"].balance == 60000
    assert jars["New laptop"].balance == 35000
    tax_jar = next(j for j in account.jars if j.id == TAX_JAR_ID)
    assert (tax_jar.type, tax_jar.currency, tax_jar.balance) == ("tax", "EUR", 0)


def test_seed_profile_starts_disabled(session):
    profile = session.get(ProfileRow, PROFILE_ID)
    assert (profile.country, profile.regime, profile.rate_bp, profile.tax_currency) == (
        "EE",
        "entrepreneur_account",
        2000,
        "EUR",
    )
    assert profile.enabled is False


def test_seed_has_history_without_reservations(session):
    assert len(session.exec(select(TransactionRow)).all()) > 0
    assert session.exec(select(ReservationRow)).all() == []
    assert all(c.status is None for c in session.exec(select(CounterpartyRow)).all())


def test_account_json_is_camel_case(session):
    body = db.to_account(session).model_dump(mode="json", by_alias=True)
    assert set(body) == {"owner", "balances", "jars"}


def test_to_transaction_contract_shape(session):
    row = session.exec(select(TransactionRow)).first()
    body = db.to_transaction(session, row).model_dump(mode="json", by_alias=True)
    assert set(body) == {
        "id", "direction", "amount", "currency", "counterparty", "reference",
        "createdAt", "classification", "reservationId", "reservation",
    }
    assert set(body["counterparty"]) == {"name", "kind", "isKnownClient"}
    assert set(body["classification"]) == {"label", "confidence", "reasons"}
    assert body["reservation"] is None and body["reservationId"] is None


def test_created_at_leaves_as_utc(session):
    row = session.exec(select(TransactionRow)).first()
    created_at = db.to_transaction(session, row).created_at
    assert created_at.utcoffset().total_seconds() == 0


def test_to_transaction_embeds_reservation_and_known_client(session):
    row = session.exec(select(TransactionRow).where(TransactionRow.direction == "in")).first()
    reservation = ReservationRow(
        transaction_id=row.id, source_amount=30000, source_currency="USD", rate_bp=2000,
        fx_rate=0.92, reserved_amount=27600, tax_currency="EUR",
    )
    session.add(reservation)
    row.reservation_id = reservation.id
    session.get(CounterpartyRow, row.counterparty_key).status = "client"
    session.commit()

    tx = db.to_transaction(session, row)
    assert tx.reservation_id == reservation.id
    assert tx.counterparty.is_known_client is True
    assert tx.reservation.model_dump(by_alias=True) == {
        "id": reservation.id, "transactionId": row.id, "sourceAmount": 30000, "sourceCurrency": "USD",
        "rate": 2000, "fxRate": 0.92, "reservedAmount": 27600, "taxCurrency": "EUR", "status": "reserved",
        "breakdown": None,
    }


def test_reset_restores_seed_after_changes(session, onboarded):
    session.get(JarRow, TAX_JAR_ID).balance = 999
    session.get(BalanceRow, "EUR").amount = 1
    session.commit()

    db.reset_to_seed(session)

    assert session.get(ProfileRow, PROFILE_ID).enabled is False
    assert session.get(JarRow, TAX_JAR_ID).balance == 0
    assert session.get(BalanceRow, "EUR").amount == 245000


def test_reset_twice_does_not_duplicate(session):
    count = len(session.exec(select(TransactionRow)).all())
    db.reset_to_seed(session)
    assert len(session.exec(select(TransactionRow)).all()) == count


def test_onboarded_fixture(session, onboarded):
    profile = session.get(ProfileRow, PROFILE_ID)
    assert (profile.country, profile.regime, profile.rate_bp, profile.tax_currency, profile.enabled) == (
        "EE",
        "entrepreneur_account",
        2000,
        "EUR",
        True,
    )


def test_parse_timestamp_forms():
    expected = datetime(2026, 11, 13, 9, 0, tzinfo=timezone.utc)
    assert db.parse_timestamp("2026-11-13T09:00:00Z") == expected
    assert db.parse_timestamp("2026-11-13T09:00:00") == expected
    assert db.parse_timestamp("2026-11-13T11:00:00+02:00") == expected


def test_as_utc():
    assert db.as_utc(datetime(2026, 11, 13, 9, 0)).tzinfo == timezone.utc


def test_seed_if_empty_seeds_only_an_empty_database(session):
    from sqlmodel import delete

    for table in (ReservationRow, TransactionRow, CounterpartyRow, JarRow, BalanceRow, ProfileRow):
        session.exec(delete(table))
    session.commit()
    assert db.seed_if_empty(session) is True
    session.get(BalanceRow, "EUR").amount = 1
    session.commit()
    assert db.seed_if_empty(session) is False  # a restart must not wipe the demo state
    assert session.get(BalanceRow, "EUR").amount == 1
