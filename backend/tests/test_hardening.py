"""Limits and guards added after the code review: hostile input, list size, live-event hand-off
and request ids."""

import asyncio
import threading
import time

import pytest
from sqlalchemy import event

from app.engine.legal_forms import has_legal_form
from app.events import QUEUE_SIZE, EventBus, event_stream
from app.summary import spreadsheet_text
from helpers import ACME, simulate
from test_events import FakeRequest


# --- hostile input ---------------------------------------------------------------------------


def test_a_long_run_of_spaces_in_a_name_is_analysed_quickly():
    name = "A" + " " * 200_000 + "B"
    started = time.perf_counter()
    assert has_legal_form(name) is False
    assert time.perf_counter() - started < 1.0  # the old regex needed minutes


@pytest.mark.parametrize(
    "name, expected",
    [("Acme Ltd (UK)", True), ("Acme Ltd  (UK)  ", True), ("Acme (UK) Ltd", True), ("Acme Ltd (a (b))", False),
     ("Mari Tamm (Ltd)", False)],
)
def test_a_trailing_note_is_ignored(name, expected):
    assert has_legal_form(name) is expected


@pytest.mark.parametrize(
    "field, value",
    [("senderName", "Acme\x00 Inc."), ("reference", "INV\x00-1"), ("senderName", "A" * 141), ("reference", "r" * 281),
     ("senderName", "Acme \x1b[31m Inc.")],
)
def test_control_characters_and_oversized_text_are_rejected(client, onboarded, field, value):
    before = len(client.get("/api/transactions").json())
    response = client.post("/api/simulate/incoming", json=dict(ACME, **{field: value}))
    assert response.status_code == 422, response.text
    assert response.json()["error"]["code"] == "validation_error"
    assert len(client.get("/api/transactions").json()) == before  # nothing was written


def test_whitespace_in_a_name_is_collapsed(client, onboarded):
    tx = simulate(client, dict(ACME, senderName="  Acme \t  Inc.  "))
    assert tx["counterparty"]["name"] == "Acme Inc."


@pytest.mark.parametrize("value", ["=1+1", "+1", "-1", "@SUM(A1)", "\t=1+1", "\r=1+1", " =1+1", "  @x"])
def test_csv_cells_that_would_run_as_formulas_are_escaped(value):
    assert spreadsheet_text(value) == "'" + value


@pytest.mark.parametrize("value", ["", "INV-042", "a=b", "pizza 🍕", " plain"])
def test_ordinary_csv_cells_are_left_alone(value):
    assert spreadsheet_text(value) == value


# --- list size -------------------------------------------------------------------------------


def test_transactions_limit(client):
    everything = client.get("/api/transactions").json()
    assert len(everything) > 2
    assert client.get("/api/transactions?limit=2").json() == everything[:2]
    assert client.get("/api/transactions?limit=0").status_code == 422
    assert client.get("/api/transactions?limit=100000").status_code == 422


def test_transactions_cost_a_fixed_number_of_queries(client, session, onboarded):
    for i in range(5):
        simulate(client, dict(ACME, senderName=f"Client {i} Ltd", reference=f"INV-{i}"))
    statements = []

    def count(conn, cursor, statement, *args):
        if statement.lstrip().upper().startswith("SELECT"):
            statements.append(statement)

    session.expire_all()
    connection = session.connection()
    event.listen(connection, "before_cursor_execute", count)
    try:
        assert len(client.get("/api/transactions").json()) > 5
    finally:
        event.remove(connection, "before_cursor_execute", count)
    assert len(statements) <= 3, statements  # transactions, payers, reservations


# --- live events -----------------------------------------------------------------------------


def test_publish_from_a_worker_thread_reaches_a_live_stream():
    async def scenario():
        bus = EventBus()
        stream = event_stream(FakeRequest(), bus)
        assert await stream.__anext__() == ": connected\n\n"
        worker = threading.Thread(target=bus.publish, args=("demo.reset", {}))
        worker.start()
        frame = await asyncio.wait_for(stream.__anext__(), timeout=2)
        worker.join()
        await stream.aclose()
        return frame

    assert asyncio.run(scenario()) == "event: demo.reset\ndata: {}\n\n"


def test_a_subscriber_that_fell_behind_is_told_to_resync():
    async def scenario():
        bus = EventBus()
        stream = event_stream(FakeRequest(), bus)
        await stream.__anext__()
        for _ in range(QUEUE_SIZE + 1):
            bus.publish("transaction.created", {"transaction": {"id": "t"}})
        first = await stream.__anext__()
        bus.publish("demo.reset", {})
        second = await stream.__anext__()
        await stream.aclose()
        return first, second

    first, second = asyncio.run(scenario())
    assert first == "event: resync\ndata: {}\n\n"  # the lost events are replaced by one resync
    assert second == "event: demo.reset\ndata: {}\n\n"  # and the stream carries on


def test_publish_survives_a_stream_whose_loop_is_gone():
    bus = EventBus()

    async def subscribe_only():
        bus.subscribe()

    asyncio.run(subscribe_only())  # the loop is closed now, the subscription is left behind
    bus.publish("demo.reset", {})
    assert bus.subscriber_count == 0


# --- request ids ---------------------------------------------------------------------------


def test_every_response_carries_a_request_id(client):
    generated = client.get("/api/account").headers["x-request-id"]
    assert len(generated) == 32
    assert client.get("/api/account", headers={"X-Request-ID": "abc-123"}).headers["x-request-id"] == "abc-123"
    # Not echoed when it could forge a log line.
    unsafe = client.get("/api/account", headers={"X-Request-ID": "a b\tc"}).headers["x-request-id"]
    assert unsafe != "a b\tc" and len(unsafe) == 32
    assert client.get("/api/nope").headers["x-request-id"]


def test_request_log_line_names_the_request(client, caplog):
    with caplog.at_level("INFO", logger="app.request"):
        client.get("/api/account", headers={"X-Request-ID": "trace-me"})
    assert any("GET /api/account 200" in r.getMessage() and r.name == "app.request" for r in caplog.records)
