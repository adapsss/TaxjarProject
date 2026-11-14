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
"""
import asyncio
from typing import Dict, Tuple

READ_SLOTS = 12
WRITE_SLOTS = 4
IN_FLIGHT = READ_SLOTS + WRITE_SLOTS
# Every admitted request can have a thread and a connection at the same time, with room left for
# the health check, a new event stream's dependencies and the tax-data reader.
WORKER_THREADS = IN_FLIGHT + 4
POOL_CONNECTIONS = IN_FLIGHT + 6

_EXEMPT = ("/api/events", "/api/healthz")
_READ_METHODS = ("GET", "HEAD", "OPTIONS")


class InFlightLimitMiddleware:
    def __init__(self, app, read_slots: int = READ_SLOTS, write_slots: int = WRITE_SLOTS) -> None:
        self.app = app
        self._slots = (read_slots, write_slots)
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
        async with reads if scope["method"] in _READ_METHODS else writes:
            await self.app(scope, receive, send)
