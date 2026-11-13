"""Simulate incoming payment, answer, undo, pay tax.

Owner: role B, Backend 2. Route declarations (paths, function names, models) are
exactly those of Task S0, so the generated frontend types stay the same.
"""
from fastapi import APIRouter, Depends
from sqlmodel import Session

from app import db, pipeline, reservations
from app import schemas as s
from app.events import EventBus, get_bus
from app.routes.guards import require_demo_mode

router = APIRouter()


@router.post("/simulate/incoming", response_model=s.Transaction, dependencies=[Depends(require_demo_mode)])
async def simulate_incoming(
    body: s.SimulateIncoming,
    session: Session = Depends(db.get_session),
    bus: EventBus = Depends(get_bus),
):
    row = pipeline.process_incoming(
        session,
        bus,
        sender_name=body.sender_name,
        sender_kind=body.sender_kind,
        amount=body.amount,
        currency=body.currency,
        reference=body.reference,
    )
    return db.to_transaction(session, row)


@router.post("/transactions/{id}/answer", response_model=s.Transaction)
async def answer_transaction(
    id: str,
    body: s.Answer,
    session: Session = Depends(db.get_session),
    bus: EventBus = Depends(get_bus),
):
    row = pipeline.answer(session, bus, id, body.is_income)
    return db.to_transaction(session, row)


@router.post("/transactions/{id}/undo", response_model=s.Transaction)
async def undo_transaction(
    id: str,
    session: Session = Depends(db.get_session),
    bus: EventBus = Depends(get_bus),
):
    row = reservations.undo(session, bus, id)
    return db.to_transaction(session, row)


@router.post("/tax/pay", response_model=s.PayResult)
async def pay_tax(session: Session = Depends(db.get_session), bus: EventBus = Depends(get_bus)):
    row, paid = reservations.pay_all(session, bus)
    return s.PayResult.model_validate(
        {"transaction": db.to_transaction(session, row), "paidAmount": paid, "currency": row.currency}
    )
