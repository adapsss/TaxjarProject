"""Tax summary and CSV export.

Owner: role C. Route declarations (paths, function names, models) are exactly
those of Task S0, so the generated frontend types stay the same.
"""
from datetime import date

from fastapi import APIRouter, Depends, Response
from sqlmodel import Session

from app import db, summary
from app import schemas as s

router = APIRouter()


@router.get("/tax/summary", response_model=s.TaxSummary)
def tax_summary(session: Session = Depends(db.get_session)):
    return summary.build_summary(session, date.today())


@router.get(
    "/tax/export.csv",
    response_class=Response,
    responses={200: {"content": {"text/csv": {}}, "description": "Reservations as CSV"}},
)
def export_csv(session: Session = Depends(db.get_session)):
    # The byte-order mark makes Excel open the file as UTF-8 (names like "OÜ").
    return Response(
        content="﻿" + summary.export_csv(session),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="tax-jar.csv"'},
    )
