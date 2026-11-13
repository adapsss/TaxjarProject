"""Simulated incoming payments, answers, undo and paying the tax.

Stubs from Task S0: each returns one fixed, contract-shaped payload. Role B replaces them.
"""
from fastapi import APIRouter

from .. import examples
from ..schemas import Answer, PayResult, SimulateIncoming, Transaction

router = APIRouter(prefix="/api")


@router.post("/simulate/incoming", response_model=Transaction)
async def simulate_incoming(payment: SimulateIncoming) -> Transaction:
    return examples.transaction()


@router.post("/transactions/{id}/answer", response_model=Transaction)
async def answer(id: str, body: Answer) -> Transaction:
    return examples.transaction()


@router.post("/transactions/{id}/undo", response_model=Transaction)
async def undo(id: str) -> Transaction:
    return examples.transaction()


@router.post("/tax/pay", response_model=PayResult)
async def pay() -> PayResult:
    transaction = examples.transaction()
    return PayResult(transaction=transaction, paid_amount=transaction.reservation.reserved_amount, currency="EUR")
