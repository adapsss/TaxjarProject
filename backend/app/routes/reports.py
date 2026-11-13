"""Tax summary and the accountant export.

Until the storage from Task B2 exists these run the real engine over the
example reservation; `app/summary.py` will then feed them rows from the database.
"""
from datetime import date

from fastapi import APIRouter
from fastapi.responses import Response

from .. import examples
from ..engine import build_summary, export_rows, get_regime, to_csv
from ..schemas import TaxSummary

router = APIRouter(prefix="/api")


def _example_rows() -> list:
    transaction = examples.transaction()
    reservation = transaction.reservation
    return [{
        "status": reservation.status, "created_at": transaction.created_at, "payer": transaction.counterparty.name,
        "reference": transaction.reference, "source_amount": reservation.source_amount,
        "source_currency": reservation.source_currency, "rate_bp": reservation.rate, "fx_rate": reservation.fx_rate,
        "reserved_amount": reservation.reserved_amount, "tax_currency": reservation.tax_currency,
    }]


@router.get("/tax/summary", response_model=TaxSummary)
async def tax_summary() -> dict:
    profile = examples.PROFILE
    return build_summary(_example_rows(), tax_currency=profile.tax_currency, country=profile.country,
                         regime=profile.regime, today=date.today())


@router.get("/tax/export.csv")
async def tax_export() -> Response:
    profile = examples.PROFILE
    text = to_csv(export_rows(_example_rows(), get_regime(profile.country, profile.regime)))
    return Response(content=text, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="tax-jar.csv"'})
