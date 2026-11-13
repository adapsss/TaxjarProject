"""Fixed, contract-shaped example payloads served by the stub routes.

These are the frontend's mocks until the real handlers land. All data is synthetic.
"""
from datetime import datetime, timezone

from .engine import classify, compute_tax, get_regime, split_tax
from .schemas import (
    Account, Balance, Classification, Counterparty, Jar, TaxPart, TaxProfile, TaxReservation, Transaction,
)

OWNER = "Kadri Saar"
PROFILE = TaxProfile(country="EE", regime="entrepreneur_account", rate=2000, tax_currency="EUR", enabled=True)
USD_EUR = 0.92

ACCOUNT = Account(
    owner=OWNER,
    balances=[Balance(currency="EUR", amount=245000), Balance(currency="USD", amount=152000),
              Balance(currency="GBP", amount=15000)],
    jars=[Jar(id="holiday", name="Holiday", currency="EUR", balance=60000, type="regular"),
          Jar(id="laptop", name="New laptop", currency="EUR", balance=35000, type="regular"),
          Jar(id="tax", name="Tax Jar", currency="EUR", balance=27600, type="tax")],
)


def _reservation() -> TaxReservation:
    source = compute_tax(150000, PROFILE.rate)
    reserved = round(source * USD_EUR)
    parts = split_tax(reserved, get_regime(PROFILE.country, PROFILE.regime), PROFILE.rate)
    return TaxReservation(
        id="res-acme", transaction_id="tx-acme", source_amount=source, source_currency="USD", rate=PROFILE.rate,
        fx_rate=USD_EUR, reserved_amount=reserved, tax_currency="EUR", status="reserved",
        breakdown=[TaxPart(**p) for p in parts] if parts else None,
    )


def transaction() -> Transaction:
    result = classify(sender_name="Acme Inc.", sender_kind=None, amount=150000, reference="INV-042",
                      owner_name=OWNER, payer_status=None)
    reservation = _reservation()
    return Transaction(
        id="tx-acme", direction="in", amount=150000, currency="USD",
        counterparty=Counterparty(name="Acme Inc.", kind="company", is_known_client=False),
        reference="INV-042", created_at=datetime(2026, 11, 13, 9, 30, tzinfo=timezone.utc),
        classification=Classification(label=result.label, confidence=result.confidence, reasons=result.reasons),
        reservation_id=reservation.id, reservation=reservation,
    )
