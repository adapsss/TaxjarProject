"""Account, transactions, tax profile, countries, demo reset, events.

Owner: role B, Backend 1. Every handler here is a stub from Task S0.
"""
import asyncio

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app import schemas as s
from app import stubs

router = APIRouter()


@router.get("/account", response_model=s.Account)
async def get_account():
    return stubs.ACCOUNT


@router.get("/transactions", response_model=list[s.Transaction])
async def list_transactions():
    return stubs.TRANSACTIONS


@router.get("/tax-profile", response_model=s.TaxProfile)
async def get_tax_profile():
    return stubs.PROFILE


@router.put("/tax-profile", response_model=s.TaxProfile)
async def put_tax_profile(profile: s.TaxProfile):
    return profile


@router.get("/tax/countries", response_model=list[s.Country])
async def list_countries():
    return stubs.COUNTRIES


@router.post("/demo/reset", response_model=s.Account)
async def reset_demo():
    return stubs.ACCOUNT


async def _stub_event_stream():
    # No events yet: just keep the connection open so EventSource stays connected.
    yield ": connected\n\n"
    while True:
        await asyncio.sleep(15)
        yield ": ping\n\n"


@router.get(
    "/events",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/event-stream": {}}, "description": "Server-sent events"}},
)
async def events():
    return StreamingResponse(_stub_event_stream(), media_type="text/event-stream")
