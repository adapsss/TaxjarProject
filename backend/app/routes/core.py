"""Account, transactions, tax profile, countries, demo reset and the event stream.

Stubs from Task S0: each returns one fixed, contract-shaped payload. Role B replaces them.
"""
from typing import List

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from .. import examples
from ..engine import describe_rule, get_regime, load_countries
from ..schemas import Account, Country, TaxProfile, Transaction

router = APIRouter(prefix="/api")


@router.get("/account", response_model=Account)
async def get_account() -> Account:
    return examples.ACCOUNT


@router.get("/transactions", response_model=List[Transaction])
async def get_transactions() -> List[Transaction]:
    return [examples.transaction()]


@router.get("/tax-profile", response_model=TaxProfile)
async def get_tax_profile() -> TaxProfile:
    return examples.PROFILE


@router.put("/tax-profile", response_model=TaxProfile)
async def put_tax_profile(profile: TaxProfile) -> TaxProfile:
    return profile


@router.get("/tax/countries", response_model=List[Country])
async def get_countries() -> List[dict]:
    countries = load_countries()
    for country in countries:
        for regime in country["regimes"]:
            regime["breakdownRule"] = describe_rule(get_regime(country["code"], regime["id"]))
    return countries


@router.post("/demo/reset", response_model=Account)
async def reset_demo() -> Account:
    return examples.ACCOUNT


@router.get("/events")
async def events() -> StreamingResponse:
    async def stream():
        yield ": connected\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")
