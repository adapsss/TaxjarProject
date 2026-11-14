"""At most a fixed number of API requests are worked on at once; the rest wait their turn on the event loop.

Why not just a thread limit and a connection pool: a request holds its database connection from its
first query until its session closes, and between those it needs a worker thread several times
(handler, response validation). With more requests in flight than threads, finished handlers keep
their connections while they wait for a thread, the threads are held by handlers waiting for a
connection, and nothing moves until the pool times out. Admitting no more requests than there are
threads and connections for removes that: a waiting request holds neither.

Reads and writes are counted apart, so writers queued on the account lock (held by another backend
process) can never take every slot: the app stays readable while payments wait.

Not counted: the event stream (open for hours) and the health check (it must answer within the
container's 2 s even when every slot is busy).

A write's body is read before it gets a slot, within a time and size limit. Otherwise a client
that sends headers and then goes quiet would hold a write slot for as long as it liked, and four
of them would stop every payment.
"""
import asyncio
from typing import Dict, List, Optional, Tuple

from app.errors import error_response

READ_SLOTS = 12
WRITE_SLOTS = 4
IN_FLIGHT = READ_SLOTS + WRITE_SLOTS
# Every admitted request can have a thread and a connection at the same time, with room left for
# the health check, a new event stream's dependencies and the tax-data reader.
WORKER_THREADS = IN_FLIGHT + 4
POOL_CONNECTIONS = IN_FLIGHT + 6

MAX_BODY_BYTES = 1_000_000  # the gateway's limit too (docker/Caddyfile)
BODY_SECONDS = 10.0  # for the whole body; ours are a few hundred bytes of JSON

_EXEMPT = ("/api/events", "/api/healthz")
_READ_METHODS = ("GET", "HEAD", "OPTIONS")


class InFlightLimitMiddleware:
    def __init__(
        self, app, read_slots: int = READ_SLOTS, write_slots: int = WRITE_SLOTS, body_seconds: float = BODY_SECONDS
    ) -> None:
        self.app = app
        self._slots = (read_slots, write_slots)
        self._body_seconds = body_seconds
        # Semaphores belong to the loop they were made on (tests run each request on a loop of its own).
        self._by_loop: Dict[int, Tuple[asyncio.AbstractEventLoop, asyncio.Semaphore, asyncio.Semaphore]] = {}

    def _semaphores(self) -> Tuple[asyncio.Semaphore, asyncio.Semaphore]:
        loop = asyncio.get_running_loop()
        entry = self._by_loop.get(id(loop))
        if entry is None or entry[0] is not loop:
            self._by_loop = {key: e for key, e in self._by_loop.items() if not e[0].is_closed()}
            entry = (loop, asyncio.Semaphore(self._slots[0]), asyncio.Semaphore(self._slots[1]))
            self._by_loop[id(loop)] = entry
        return entry[1], entry[2]

    async def __call__(self, scope, receive, send) -> None:
        path = scope.get("path", "")
        if scope["type"] != "http" or not path.startswith("/api/") or path in _EXEMPT:
            await self.app(scope, receive, send)
            return
        reads, writes = self._semaphores()
        if scope["method"] in _READ_METHODS:
            async with reads:
                await self.app(scope, receive, send)
            return

        try:
            # asyncio.wait_for, not asyncio.timeout: the latter needs Python 3.11.
            body = await asyncio.wait_for(_read_body(receive), timeout=self._body_seconds)
        except asyncio.TimeoutError:
            await error_response(408, "request_timeout", "The request body did not arrive in time.")(scope, receive, send)
            return
        if body is None:
            await error_response(413, "payload_too_large", "The request body is too large.")(scope, receive, send)
            return
        async with writes:
            await self.app(scope, _replay(body, receive), send)


async def _read_body(receive) -> Optional[bytes]:
    """The whole request body; None when it is larger than MAX_BODY_BYTES or the client left."""
    chunks: List[bytes] = []
    size = 0
    while True:
        message = await receive()
        if message["type"] != "http.request":  # http.disconnect
            return None
        chunks.append(message.get("body", b""))
        size += len(chunks[-1])
        if size > MAX_BODY_BYTES:
            return None
        if not message.get("more_body", False):
            return b"".join(chunks)


def _replay(body: bytes, receive):
    """A receive() that hands the app the body already read, then the connection's later messages."""
    sent = False

    async def replayed():
        nonlocal sent
        if not sent:
            sent = True
            return {"type": "http.request", "body": body, "more_body": False}
        return await receive()

    return replayed
