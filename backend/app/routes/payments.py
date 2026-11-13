"""Simulate incoming payment, answer, undo, pay tax.

Owner: role B, Backend 2. Every handler here is a stub from Task S0.
"""
from fastapi import APIRouter

from app import schemas as s
from app import stubs

router = APIRouter()


@router.post("/simulate/incoming", response_model=s.Transaction)
async def simulate_incoming(body: s.SimulateIncoming):
    return stubs.TX_ACME


@router.post("/transactions/{id}/answer", response_model=s.Transaction)
async def answer_transaction(id: str, body: s.Answer):
    return stubs.TX_JOHN


@router.post("/transactions/{id}/undo", response_model=s.Transaction)
async def undo_transaction(id: str):
    return stubs.TX_ACME


@router.post("/tax/pay", response_model=s.PayResult)
async def pay_tax():
    return stubs.PAY_RESULT
