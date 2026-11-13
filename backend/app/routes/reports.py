"""Tax summary and CSV export.

Owner: role C. Every handler here is a stub from Task S0.
"""
from fastapi import APIRouter, Response

from app import schemas as s
from app import stubs

router = APIRouter()


@router.get("/tax/summary", response_model=s.TaxSummary)
async def tax_summary():
    return stubs.SUMMARY


@router.get(
    "/tax/export.csv",
    response_class=Response,
    responses={200: {"content": {"text/csv": {}}, "description": "Reservations as CSV"}},
)
async def export_csv():
    return Response(
        content=stubs.EXPORT_CSV,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="tax-jar.csv"'},
    )
