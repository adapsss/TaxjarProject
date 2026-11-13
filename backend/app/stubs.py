"""Fixed, contract-shaped example payloads.

Every route returns one of these until its real handler lands, so the frontend
can be built before the backend exists. Delete an entry when nothing uses it.
All names are invented.
"""
from datetime import date, datetime, timezone

from app import schemas as s

DISCLAIMER = "An estimate for setting money aside, not tax advice."

PROFILE = s.TaxProfile(country="EE", regime="entrepreneur_account", rate=2000, tax_currency="EUR", enabled=True)

ACCOUNT = s.Account(
    owner="Kadri Saar",
    balances=[
        s.Balance(currency="EUR", amount=287300),
        s.Balance(currency="USD", amount=152000),
        s.Balance(currency="GBP", amount=15000),
    ],
    jars=[
        s.Jar(id="holiday", name="Holiday", currency="EUR", balance=60000, type="regular"),
        s.Jar(id="laptop", name="New laptop", currency="EUR", balance=35000, type="regular"),
        s.Jar(id="tax", name="Tax Jar", currency="EUR", balance=27600, type="tax"),
    ],
)

COUNTRIES = [
    s.Country(
        code="EE",
        name="Estonia",
        regimes=[
            s.Regime(
                id="entrepreneur_account",
                name="Entrepreneur account (ettevõtluskonto)",
                default_rate=2000,
                hint="20% of every payment received is set aside.",
            ),
            s.Regime(
                id="fie",
                name="FIE / self-employed",
                default_rate=2200,
                hint="Income tax is 22%. Social tax comes on top, so set the rate you want to reserve.",
            ),
        ],
    ),
    s.Country(
        code="*",
        name="Other",
        regimes=[
            s.Regime(id="custom", name="Custom", default_rate=2000, hint="Enter the percentage you want to set aside.")
        ],
    ),
]

_ACME_RESERVATION = s.TaxReservation(
    id="res-acme",
    transaction_id="tx-acme",
    source_amount=30000,
    source_currency="USD",
    rate=2000,
    fx_rate=0.92,
    reserved_amount=27600,
    tax_currency="EUR",
    status="reserved",
)

# One transaction per state the UI has to draw: tax set aside, personal, needs an answer.
TX_ACME = s.Transaction(
    id="tx-acme",
    direction="in",
    amount=150000,
    currency="USD",
    counterparty=s.Counterparty(name="Acme Inc.", kind="company", is_known_client=False),
    reference="INV-042",
    created_at=datetime(2026, 11, 13, 10, 30, tzinfo=timezone.utc),
    classification=s.Classification(
        label="income", confidence=1.0, reasons=["company sender", "invoice in reference"]
    ),
    reservation_id="res-acme",
    reservation=_ACME_RESERVATION,
)
TX_JOHN = s.Transaction(
    id="tx-john",
    direction="in",
    amount=40000,
    currency="EUR",
    counterparty=s.Counterparty(name="John Smith", kind="unknown", is_known_client=False),
    reference="website",
    created_at=datetime(2026, 11, 13, 9, 15, tzinfo=timezone.utc),
    classification=s.Classification(label="unknown", confidence=0.45, reasons=["work-related reference"]),
    reservation_id=None,
    reservation=None,
)
TX_MARI = s.Transaction(
    id="tx-mari",
    direction="in",
    amount=2300,
    currency="EUR",
    counterparty=s.Counterparty(name="Mari Tamm", kind="person", is_known_client=False),
    reference="pizza 🍕",
    created_at=datetime(2026, 11, 12, 19, 5, tzinfo=timezone.utc),
    classification=s.Classification(
        label="personal", confidence=1.0, reasons=["everyday reference", "small amount from a private person"]
    ),
    reservation_id=None,
    reservation=None,
)
TRANSACTIONS = [TX_ACME, TX_JOHN, TX_MARI]  # newest first

TAX_PAYMENT = s.Transaction(
    id="tx-tax-payment",
    direction="out",
    amount=27600,
    currency="EUR",
    counterparty=s.Counterparty(name="Tax authority (demo)", kind="company", is_known_client=False),
    reference="Tax payment",
    created_at=datetime(2026, 11, 13, 11, 0, tzinfo=timezone.utc),
    classification=s.Classification(label="personal", confidence=1.0, reasons=[]),
    reservation_id=None,
    reservation=None,
)
PAY_RESULT = s.PayResult(transaction=TAX_PAYMENT, paid_amount=27600, currency="EUR")

SUMMARY = s.TaxSummary(
    tax_currency="EUR",
    total_reserved=27600,
    total_paid=0,
    by_month=[s.MonthTotal(month="2026-11", reserved=27600)],
    estimated_due=27600,
    next_deadline=date(2026, 12, 10),
    disclaimer=DISCLAIMER,
)

EXPORT_CSV = (
    "date,payer,reference,source_amount,source_currency,tax_rate_percent,fx_rate,"
    "reserved_amount,tax_currency,status\r\n"
    "2026-11-13,Acme Inc.,INV-042,300.00,USD,20,0.92,276.00,EUR,reserved\r\n"
)
