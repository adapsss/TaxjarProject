"""Account, transactions, tax profile, countries, demo reset, events.

Owner: role B, Backend 1. Route declarations (paths, function names, models) are
exactly those of Task S0, so the generated frontend types stay the same.
"""
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app import db, fx
from app import schemas as s
from app.engine import tax_rules
from app.errors import ApiError
from app.events import EventBus, get_bus, sse_response
from app.models import TAX_JAR_ID, JarRow, TransactionRow
from app.routes.guards import require_demo_mode
from app.taxdata import tables as t

router = APIRouter()

MAX_RATE_BP = 10000


@router.get("/account", response_model=s.Account)
async def get_account(session: Session = Depends(db.get_session)):
    return db.to_account(session)


@router.get("/transactions", response_model=list[s.Transaction])
async def list_transactions(session: Session = Depends(db.get_session)):
    newest_first = (TransactionRow.created_at.desc(), TransactionRow.seq.desc())
    rows = session.exec(select(TransactionRow).order_by(*newest_first)).all()
    return [db.to_transaction(session, row) for row in rows]


@router.get("/tax-profile", response_model=s.TaxProfile)
async def get_tax_profile(session: Session = Depends(db.get_session)):
    return db.to_profile(db.get_profile(session))


@router.put("/tax-profile", response_model=s.TaxProfile)
async def put_tax_profile(profile: s.TaxProfile, session: Session = Depends(db.get_session)):
    if not 0 <= profile.rate <= MAX_RATE_BP:
        raise ApiError(422, "validation_error", "rate must be between 0 and 10000 basis points (0% to 100%).")
    if tax_rules.get_regime(profile.country, profile.regime) is None:
        raise ApiError(422, "unknown_regime", f"There is no regime {profile.regime!r} for country {profile.country!r}.")
    currency = profile.tax_currency.strip().upper()
    if not fx.is_supported(currency):
        raise ApiError(422, "unsupported_currency", f"{profile.tax_currency} is not supported. Use EUR, USD or GBP.")

    jar = session.get(JarRow, TAX_JAR_ID)
    if jar.currency != currency:
        if jar.balance != 0:
            raise ApiError(
                409,
                "tax_jar_not_empty",
                "The Tax Jar still holds money. Pay it or undo the reservations before changing the tax currency.",
            )
        jar.currency = currency
        session.add(jar)

    row = db.get_profile(session)
    row.country = profile.country
    row.regime = profile.regime
    row.rate_bp = profile.rate
    row.tax_currency = currency
    row.enabled = profile.enabled
    session.add(row)
    session.commit()
    return db.to_profile(row)


@router.get("/tax/countries", response_model=list[s.Country])
async def list_countries():
    return tax_rules.load_countries()


@router.get("/demo/scenarios", response_model=list[s.DemoScenario], dependencies=[Depends(require_demo_mode)])
async def demo_scenarios(session: Session = Depends(db.get_session)):
    rows = session.execute(select(t.demo_scenario).order_by(t.demo_scenario.c.position)).mappings()
    return [
        s.DemoScenario.model_validate(
            {"id": r["id"], "label": r["label"], "senderName": r["sender_name"], "senderKind": r["sender_kind"],
             "amount": r["amount"], "currency": r["currency"], "reference": r["reference"], "expect": r["expect"]}
        )
        for r in rows
    ]


@router.post("/demo/reset", response_model=s.Account, dependencies=[Depends(require_demo_mode)])
async def reset_demo(session: Session = Depends(db.get_session), bus: EventBus = Depends(get_bus)):
    db.reset_to_seed(session)
    bus.publish("demo.reset", {})
    return db.to_account(session)


@router.get(
    "/events",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/event-stream": {}}, "description": "Server-sent events"}},
)
async def events(request: Request, bus: EventBus = Depends(get_bus)):
    return sse_response(request, bus)
