"""Simulate incoming payment, answer, undo, pay tax.

Owner: role B, Backend 2. Route declarations (paths, function names, models) are
exactly those of Task S0, so the generated frontend types stay the same.
"""
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app import db, pipeline, reservations
from app import schemas as s
from app.events import EventBus, get_bus
from app.routes.guards import require_demo_mode

router = APIRouter()


@router.post("/simulate/incoming", response_model=s.Transaction, dependencies=[Depends(require_demo_mode)])
def simulate_incoming(
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
def answer_transaction(
    id: str,
    body: s.Answer,
    session: Session = Depends(db.get_session),
    bus: EventBus = Depends(get_bus),
):
    row = pipeline.answer(session, bus, id, body.is_income)
    return db.to_transaction(session, row)


@router.post("/transactions/{id}/mark-income", response_model=s.Transaction)
async def mark_income(
    id: str,
    session: Session = Depends(db.get_session),
    bus: EventBus = Depends(get_bus),
):
    """The reverse of undo: count this payment as work income and set its tax aside."""
    row = pipeline.mark_income(session, bus, id)
    return db.to_transaction(session, row)


@router.post("/transactions/{id}/undo", response_model=s.Transaction)
def undo_transaction(
    id: str,
    session: Session = Depends(db.get_session),
    bus: EventBus = Depends(get_bus),
):
    row = reservations.undo(session, bus, id)
    return db.to_transaction(session, row)


@router.post("/tax/pay", response_model=s.PayResult)
def pay_tax(session: Session = Depends(db.get_session), bus: EventBus = Depends(get_bus)):
    row, paid = reservations.pay_all(session, bus)
    return s.PayResult.model_validate(
        {"transaction": db.to_transaction(session, row), "paidAmount": paid, "currency": row.currency}
    )


def _since(day: Optional[date]) -> datetime:
    day = day or date(date.today().year, 1, 1)
    return datetime(day.year, day.month, day.day, tzinfo=timezone.utc)


@router.get("/tax/catch-up", response_model=s.CatchUp)
def catch_up_preview(
    since: Optional[date] = Query(None, description="Defaults to 1 January this year"),
    session: Session = Depends(db.get_read_session),
):
    """Income that arrived before the Tax Jar, and the tax it would set aside now."""
    return s.CatchUp.model_validate(reservations.catch_up_preview(session, _since(since)))


@router.post("/tax/catch-up", response_model=s.CatchUp)
def catch_up(
    body: s.CatchUpRequest,
    session: Session = Depends(db.get_session),
    bus: EventBus = Depends(get_bus),
):
    """Set the tax aside for that earlier income now, in one go."""
    return s.CatchUp.model_validate(reservations.catch_up(session, bus, _since(body.since)))
