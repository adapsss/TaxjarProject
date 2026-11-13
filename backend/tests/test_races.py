"""Concurrent requests from several backend processes must not corrupt money (final review, Important 1-2).

These run on real sessions outside the rolled-back test transaction, so they can block each other;
each test restores the seed afterwards.
"""
import threading
import time

import pytest
from sqlalchemy import text
from sqlmodel import Session, select

from app import db, pipeline, reservations
from app.errors import ApiError
from app.models import PROFILE_ID, TAX_JAR_ID, JarRow, ProfileRow, ReservationRow, TransactionRow
from invariants import assert_invariants


class _Bus:
    def publish(self, *args, **kwargs):
        pass


BUS = _Bus()


@pytest.fixture
def live(pg_engine):
    def fresh():
        with Session(pg_engine) as s:
            db.reset_to_seed(s)
            p = s.get(ProfileRow, PROFILE_ID)
            p.country, p.regime, p.rate_bp, p.tax_currency, p.enabled = "EE", "entrepreneur_account", 2000, "EUR", True
            s.add(p)
            s.commit()

    fresh()
    yield pg_engine
    with Session(pg_engine) as s:
        db.reset_to_seed(s)


def _pay(engine, name="Acme Inc.", amount=150000, currency="USD", reference="INV-042"):
    with Session(engine) as s:
        return pipeline.process_incoming(s, BUS, sender_name=name, sender_kind=None, amount=amount,
                                         currency=currency, reference=reference).id


def _together(engine, calls, hold_jar=True):
    """Start every call at once while another connection holds the Tax Jar, so they all queue up."""
    errors, results = [], []
    holder = None
    if hold_jar:
        holder = engine.connect()
        holder.execute(text("SELECT 1 FROM jarrow WHERE id = 'tax' FOR UPDATE"))
    barrier = threading.Barrier(len(calls))

    def run(call):
        barrier.wait()
        try:
            results.append(call())
        except ApiError as e:
            errors.append(e.code)
        except Exception as e:  # noqa: BLE001 - the test reports any crash
            errors.append(f"{type(e).__name__}: {str(e).splitlines()[0]}")

    threads = [threading.Thread(target=run, args=(c,)) for c in calls]
    for t in threads:
        t.start()
    if holder is not None:
        time.sleep(0.8)
        holder.rollback()
        holder.close()
    for t in threads:
        t.join()
    return errors, results


def _pay_all(engine):
    def call():
        with Session(engine) as s:
            return reservations.pay_all(s, BUS)[1]
    return call


def test_paying_twice_at_once_pays_once(live):
    _pay(live)
    errors, results = _together(live, [_pay_all(live), _pay_all(live)])
    assert sorted(results) == [27600] and errors == ["nothing_to_pay"]
    with Session(live) as s:
        assert s.get(JarRow, TAX_JAR_ID).balance == 0
        outgoing = s.exec(select(TransactionRow).where(TransactionRow.direction == "out")).all()
        assert [t.amount for t in outgoing if t.reference == "Tax payment"] == [27600]
        assert_invariants(s)


def test_pay_racing_undo_keeps_the_jar_consistent(live):
    tx_id = _pay(live)

    def undo():
        with Session(live) as s:
            return reservations.undo(s, BUS, tx_id).id

    errors, _ = _together(live, [_pay_all(live), undo])
    assert len(errors) == 1 and errors[0] in ("reservation_paid", "nothing_to_pay"), errors
    with Session(live) as s:
        assert s.get(JarRow, TAX_JAR_ID).balance == 0
        assert_invariants(s)


def test_fresh_start_racing_payments_never_fails(live):
    def reset():
        with Session(live) as s:
            db.reset_to_seed(s)

    for _ in range(8):
        errors, _ = _together(live, [reset, lambda: _pay(live), lambda: _pay(live, "Mari Tamm", 2300, "EUR", "pizza")],
                              hold_jar=False)
        assert errors == []
        with Session(live) as s:
            assert_invariants(s)
            assert s.exec(select(ReservationRow)).all() is not None
