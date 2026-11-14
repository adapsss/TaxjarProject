"""Limits and guards added after the code review: hostile input, list size, live-event hand-off
and request ids."""

import asyncio
import json
import threading
import time

import pytest
from sqlalchemy import event

from app.engine.legal_forms import has_legal_form
from app.events import QUEUE_SIZE, EventBus, event_stream
from app.summary import spreadsheet_text
from conftest import TEST_DATABASE_URL
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
     ("senderName", "Acme \x1b[31m Inc."), ("senderName", "\ud800x"), ("reference", "\udfff"),
     ("senderName", "\u200b"), ("senderName", "\u202e ...")],
)
def test_control_characters_and_oversized_text_are_rejected(client, onboarded, field, value):
    before = len(client.get("/api/transactions").json())
    # Sent as JSON text with \u escapes: that is how a lone surrogate reaches a server.
    body = json.dumps(dict(ACME, **{field: value}))
    response = client.post("/api/simulate/incoming", content=body, headers={"content-type": "application/json"})
    assert response.status_code == 422, response.text
    assert response.json()["error"]["code"] == "validation_error"
    assert len(client.get("/api/transactions").json()) == before  # nothing was written


def test_whitespace_in_a_name_is_collapsed(client, onboarded):
    tx = simulate(client, dict(ACME, senderName="  Acme \t  Inc.  "))
    assert tx["counterparty"]["name"] == "Acme Inc."


@pytest.mark.parametrize(
    "value", ["=1+1", "+1", "-1", "@SUM(A1)", "\t=1+1", "\r=1+1", " =1+1", "  @x", "\ufeff=1+1", "\u200b =1"]
)
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


def test_a_transaction_id_that_cannot_exist_is_not_found(client, onboarded):
    for path in ("/api/transactions/%00/undo", "/api/transactions/" + "x" * 200 + "/undo"):
        response = client.post(path)
        assert response.status_code == 404, response.text
    assert client.post("/api/transactions/%00/answer", json={"isIncome": True}).status_code == 404


def _crashing_client():
    from fastapi.testclient import TestClient

    from app.main import create_app

    app = create_app()

    @app.get("/api/boom")
    def boom():
        raise RuntimeError("boom")

    return TestClient(app, raise_server_exceptions=False)


def test_a_crash_is_answered_once_with_its_request_id(caplog):
    with caplog.at_level("INFO"):
        response = _crashing_client().get("/api/boom", headers={"X-Request-ID": "crash-1"})
    assert response.status_code == 500
    assert response.json() == {"error": {"code": "internal_error", "message": "Something went wrong on our side."}}
    assert response.headers["x-request-id"] == "crash-1"
    crash = [r for r in caplog.records if r.levelname == "ERROR" and "Unhandled error on GET /api/boom" in r.getMessage()]
    assert len(crash) == 1  # logged while the request id was still set, and not a second time by the fallback


def test_a_line_break_in_the_path_cannot_fake_a_log_line(client, caplog):
    with caplog.at_level("INFO", logger="app.request"):
        client.get("/api/nothing%0A2026-11-14 INFO app.request [-] GET /api/admin 200 1ms")
    lines = [r.getMessage() for r in caplog.records if r.name == "app.request"]
    assert len(lines) == 1 and "\n" not in lines[0] and "\\n" in lines[0]


# --- many requests at once -------------------------------------------------------------------


def test_a_burst_of_requests_is_served_without_running_out_of_connections(monkeypatch, pg_engine):
    """More requests at once than threads or connections: they queue, none fails, the health check answers.

    Before the in-flight limit, 60 at once left 20 with a 500 after the pool timeout.
    """
    import anyio.to_thread
    import httpx
    from sqlmodel import Session, create_engine

    from app import db, limits
    from app.main import create_app

    with Session(pg_engine) as s:
        db.reset_to_seed(s)  # committed: the requests below use connections of their own
    engine = create_engine(TEST_DATABASE_URL, pool_size=db.POOL_SIZE, max_overflow=db.POOL_OVERFLOW, pool_timeout=3)
    monkeypatch.setattr(db, "_engine", engine)
    app = create_app()

    async def scenario():
        limiter = anyio.to_thread.current_default_thread_limiter()
        before, limiter.total_tokens = limiter.total_tokens, limits.WORKER_THREADS
        try:
            transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
            async with httpx.AsyncClient(transport=transport, base_url="http://test", timeout=30) as http:
                burst = asyncio.gather(*[http.get("/api/account") for _ in range(80)])
                await asyncio.sleep(0.05)
                started = time.perf_counter()
                health = await http.get("/api/healthz")
                return [r.status_code for r in await burst], health.status_code, time.perf_counter() - started
        finally:
            limiter.total_tokens = before

    try:
        statuses, health, health_seconds = asyncio.run(scenario())
    finally:
        engine.dispose()
    assert statuses == [200] * 80
    assert health == 200 and health_seconds < 2  # the container's health check gives up after 2 s


def test_writes_cannot_take_the_slots_reads_need():
    from app.limits import InFlightLimitMiddleware

    async def scenario():
        release = asyncio.Event()
        served = []

        async def app(scope, receive, send):
            served.append((scope["method"], scope["path"]))
            if scope["method"] == "POST":
                await release.wait()

        limited = InFlightLimitMiddleware(app, read_slots=2, write_slots=1)

        async def empty_body():
            return {"type": "http.request", "body": b"", "more_body": False}

        def call(method, path):
            return asyncio.ensure_future(limited({"type": "http", "method": method, "path": path}, empty_body, None))

        writes = [call("POST", "/api/tax/pay") for _ in range(3)]
        await asyncio.sleep(0.01)
        assert served == [("POST", "/api/tax/pay")]  # one write admitted, two wait
        await asyncio.gather(call("GET", "/api/account"), call("GET", "/api/events"), call("GET", "/api/healthz"))
        assert len(served) == 4  # reads, the stream and the health check are not behind the waiting writes
        release.set()
        await asyncio.gather(*writes)
        assert len(served) == 6

    asyncio.run(scenario())


def test_a_write_whose_body_never_arrives_holds_no_slot():
    """Four clients that send headers and go quiet used to take every write slot."""
    from app.limits import InFlightLimitMiddleware

    async def scenario():
        served, answers = [], []

        async def app(scope, receive, send):
            served.append((await receive())["body"])

        async def never():
            await asyncio.Event().wait()

        async def whole():
            return {"type": "http.request", "body": b'{"ok": true}', "more_body": False}

        async def send(message):
            if message["type"] == "http.response.start":
                answers.append(message["status"])

        limited = InFlightLimitMiddleware(app, write_slots=1, body_seconds=0.2)
        scope = {"type": "http", "method": "POST", "path": "/api/tax/pay"}
        stuck = [asyncio.ensure_future(limited(scope, never, send)) for _ in range(4)]
        await asyncio.sleep(0.01)
        await asyncio.wait_for(limited(scope, whole, send), timeout=0.1)  # served at once, past the stuck ones
        assert served == [b'{"ok": true}']
        await asyncio.gather(*stuck)
        assert answers == [408] * 4

    asyncio.run(scenario())


def test_an_oversized_body_is_refused_before_it_is_buffered():
    from app import limits

    async def scenario():
        answers = []
        chunks = iter([{"type": "http.request", "body": b"x" * 600_000, "more_body": True}] * 3)

        async def receive():
            return next(chunks)

        async def send(message):
            if message["type"] == "http.response.start":
                answers.append(message["status"])

        async def app(scope, receive, send):
            raise AssertionError("must not reach the app")

        await limits.InFlightLimitMiddleware(app)({"type": "http", "method": "POST", "path": "/api/tax/pay"}, receive, send)
        return answers

    assert asyncio.run(scenario()) == [413]
