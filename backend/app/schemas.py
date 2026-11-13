"""The API contract. Frozen after Task S0: changes go through the tech lead.

Python uses snake_case; JSON uses camelCase through the alias generator.
Amounts are integers in minor units, rates are integer basis points.
"""
from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

Label = Literal["income", "personal", "unknown"]
Kind = Literal["company", "person", "unknown"]


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class TaxProfile(ApiModel):
    country: str
    regime: str
    rate: int
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
    reasons: List[str]


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
    rate: int
    fx_rate: float
    reserved_amount: int
    tax_currency: str
    status: Literal["reserved", "undone", "paid"]
    # exact split of reserved_amount; null when the regime defines no per-payment split
    breakdown: Optional[List[TaxPart]] = None


class Transaction(ApiModel):
    id: str
    direction: Literal["in", "out"]
    amount: int
    currency: str
    counterparty: Counterparty
    reference: str
    created_at: datetime
    classification: Classification
    reservation_id: Optional[str] = None
    reservation: Optional[TaxReservation] = None


class Account(ApiModel):
    owner: str
    balances: List[Balance]
    jars: List[Jar]


class Regime(ApiModel):
    id: str
    name: str
    default_rate: int
    hint: str
    # the regime's taxes in words, shown where no money split exists
    breakdown_rule: str = ""


class Country(ApiModel):
    code: str
    name: str
    regimes: List[Regime]


class SimulateIncoming(ApiModel):
    sender_name: str
    sender_kind: Optional[Kind] = None
    amount: int
    currency: str
    reference: str = ""


class Answer(ApiModel):
    is_income: bool


class MonthTotal(ApiModel):
    month: str
    reserved: int


class TaxSummary(ApiModel):
    tax_currency: str
    total_reserved: int
    total_paid: int
    by_month: List[MonthTotal]
    estimated_due: int
    next_deadline: Optional[date] = None
    disclaimer: str
    # exact split of total_reserved; null when the regime defines no per-payment split
    breakdown: Optional[List[TaxPart]] = None
    breakdown_rule: str = ""


class PayResult(ApiModel):
    transaction: Transaction
    paid_amount: int
    currency: str


class ErrorBody(ApiModel):
    code: str
    message: str


class ErrorResponse(ApiModel):
    error: ErrorBody
