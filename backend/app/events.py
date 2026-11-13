"""In-memory event bus and the SSE stream behind GET /api/events. Owned by Backend 1.

Event types and data (frozen contract):
    transaction.created, reservation.created, question.asked, reservation.undone
        data {"transaction": <Transaction JSON>}
    demo.reset
        data {}

Publish only from `async def` route handlers, after the database commit. asyncio
queues are not thread-safe, so publish must run on the event loop thread.
"""

import asyncio
import json
import logging
from datetime import date, datetime
from typing import Any, AsyncIterator, List

from fastapi import Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)

PING_SECONDS = 15.0
QUEUE_SIZE = 256  # per subscriber; a tab that stops reading loses events instead of growing memory


class EventBus:
    def __init__(self) -> None:
        self._subscribers: List[asyncio.Queue] = []

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)

    def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=QUEUE_SIZE)
        self._subscribers.append(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        try:
            self._subscribers.remove(queue)
        except ValueError:
            pass

    def publish(self, type: str, data: dict) -> None:
        """Hand (type, data) to every subscriber. Never blocks, never raises."""
        for queue in list(self._subscribers):
            try:
                queue.put_nowait((type, data))
            except asyncio.QueueFull:
                logger.warning("SSE subscriber is not reading; dropped %s", type)


_bus = EventBus()


def get_bus() -> EventBus:
    """FastAPI dependency: the app's one bus. Tests swap it via dependency_overrides."""
    return _bus


def _json_default(value: Any) -> Any:
    # Lets a publisher pass a schemas model as-is; it still leaves in camelCase.
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json", by_alias=True)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    raise TypeError(f"{type(value).__name__} is not JSON serializable")


def format_sse(type: str, data: dict) -> str:
    """One SSE frame: "event: <type>\\ndata: <json>\\n\\n". json.dumps never emits a raw newline."""
    return f"event: {type}\ndata: {json.dumps(data, ensure_ascii=False, default=_json_default)}\n\n"


async def event_stream(
    request: Request, bus: EventBus, ping_seconds: float = PING_SECONDS
) -> AsyncIterator[str]:
    """Yield SSE frames until the client goes away, with a ": ping" comment when idle."""
    queue = bus.subscribe()
    try:
        yield ": connected\n\n"
        while not await request.is_disconnected():
            try:
                # asyncio.wait_for, not asyncio.timeout: the latter needs Python 3.11.
                event_type, data = await asyncio.wait_for(queue.get(), timeout=ping_seconds)
            except asyncio.TimeoutError:
                yield ": ping\n\n"
                continue
            yield format_sse(event_type, data)
    finally:
        bus.unsubscribe(queue)


def sse_response(request: Request, bus: EventBus) -> StreamingResponse:
    """What GET /api/events returns."""
    return StreamingResponse(
        event_stream(request, bus),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
