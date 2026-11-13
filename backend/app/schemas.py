"""The API contract. Frozen after Task S0: changes go through the tech lead.

Python uses snake_case; JSON uses camelCase (taxCurrency, isIncome, ...).
Amounts are integers in minor units (cents). Rates are basis points (2000 = 20%).
"""
from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

Label = Literal["income", "personal", "unknown"]
Kind = Literal["company", "person", "unknown"]


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class TaxProfile(ApiModel):
    country: str
    regime: str
    rate: int  # basis points
    tax_currency: str
    enabled: bool


class Balance(ApiModel):
    currency: str
    amount: int


class Jar(ApiModel):
    id: str
    name: str
    currency: str
    balance: int
    type: Literal["tax", "regular"]


class Counterparty(ApiModel):
    name: str
    kind: Kind
    is_known_client: bool


class Classification(ApiModel):
    label: Label
    confidence: float
    reasons: list[str]


class TaxPart(ApiModel):
    """One tax inside a reserved amount, e.g. income tax or social tax."""

    id: str
    name: str
    amount: int


class TaxReservation(ApiModel):
    id: str
    transaction_id: str
    source_amount: int
    source_currency: str
    rate: int  # basis points
    fx_rate: float  # display only
    reserved_amount: int
    tax_currency: str
    status: Literal["reserved", "undone", "paid"]
    # Exact split of reserved_amount; null when the regime defines no per-payment split.
    breakdown: Optional[list[TaxPart]] = None


class Transaction(ApiModel):
    id: str
    direction: Literal["in", "out"]
    amount: int
    currency: str
    counterparty: Counterparty
    reference: str
    created_at: datetime
    classification: Classification
    reservation_id: Optional[str]
    reservation: Optional[TaxReservation]


class Account(ApiModel):
    owner: str
    balances: list[Balance]
    jars: list[Jar]


class Regime(ApiModel):
    id: str
    name: str
    default_rate: int  # basis points
    hint: str
    # The regime's taxes in words, shown where no money split exists.
    breakdown_rule: str = ""


class Country(ApiModel):
    code: str
    name: str
    # The country's own currency (ISO 4217), suggested as the tax currency. None for "*" (Other).
    currency: Optional[str] = None
    regimes: list[Regime]


class SimulateIncoming(ApiModel):
    sender_name: str
    sender_kind: Optional[Kind] = None
    amount: int
    currency: str
    reference: str = ""


class Answer(ApiModel):
    is_income: bool


class MonthTotal(ApiModel):
    month: str  # "YYYY-MM"
    reserved: int


class TaxSummary(ApiModel):
    tax_currency: str
    total_reserved: int
    total_paid: int
    by_month: list[MonthTotal]
    estimated_due: int
    next_deadline: Optional[date]
    disclaimer: str
    # Exact split of total_reserved; null when the regime defines no per-payment split.
    breakdown: Optional[list[TaxPart]] = None
    breakdown_rule: str = ""


class CatchUp(ApiModel):
    """Income received before the Tax Jar was set up, and the tax for it (preview or result)."""

    since: date
    count: int  # payments
    income: int  # their total, converted to the tax currency
    reserved: int  # tax set aside (or that would be), in the tax currency
    tax_currency: str


class CatchUpRequest(ApiModel):
    # Defaults to 1 January of the current year: the tax year in most countries.
    since: Optional[date] = None


class PayResult(ApiModel):
    transaction: Transaction
    paid_amount: int
    currency: str


class ErrorBody(ApiModel):
    code: str
    message: str


class ErrorResponse(ApiModel):
    error: ErrorBody
