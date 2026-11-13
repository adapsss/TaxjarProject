import asyncio

from app.events import EventBus, event_stream, format_sse, get_bus

class FakeRequest:
    """Stands in for starlette's Request: the stream only asks whether the client left."""

    def __init__(self) -> None:
        self.disconnected = False

    async def is_disconnected(self) -> bool:
        return self.disconnected


def test_publish_reaches_every_subscriber():
    bus = EventBus()
    first, second = bus.subscribe(), bus.subscribe()
    bus.publish("transaction.created", {"transaction": {"id": "t1"}})
    expected = ("transaction.created", {"transaction": {"id": "t1"}})
    assert first.get_nowait() == expected
    assert second.get_nowait() == expected


def test_unsubscribed_queue_gets_nothing():
    bus = EventBus()
    queue = bus.subscribe()
    bus.unsubscribe(queue)
    bus.publish("demo.reset", {})
    assert queue.empty()
    assert bus.subscriber_count == 0


def test_unsubscribe_twice_is_fine():
    bus = EventBus()
    queue = bus.subscribe()
    bus.unsubscribe(queue)
    bus.unsubscribe(queue)


def test_publish_with_no_subscribers_is_fine():
    EventBus().publish("demo.reset", {})


def test_full_queue_drops_instead_of_raising():
    bus = EventBus()
    queue = bus.subscribe()
    for _ in range(queue.maxsize + 5):
        bus.publish("demo.reset", {})
    assert queue.full()


def test_format_sse():
    assert format_sse("demo.reset", {}) == "event: demo.reset\ndata: {}\n\n"


def test_format_sse_keeps_one_data_line():
    frame = format_sse("transaction.created", {"transaction": {"reference": "line1\nline2 🍕"}})
    assert frame.count("\n") == 3
    assert "🍕" in frame


def test_get_bus_is_one_bus():
    assert get_bus() is get_bus()


def test_reset_publishes_demo_reset(client, events):
    client.post("/api/demo/reset")
    assert events[-1] == ("demo.reset", {})


def test_stream_sends_published_events_and_unsubscribes():
    async def scenario():
        bus = EventBus()
        stream = event_stream(FakeRequest(), bus)
        assert await stream.__anext__() == ": connected\n\n"
        assert bus.subscriber_count == 1
        bus.publish("demo.reset", {})
        assert await stream.__anext__() == "event: demo.reset\ndata: {}\n\n"
        await stream.aclose()
        assert bus.subscriber_count == 0

    asyncio.run(scenario())


def test_stream_pings_when_idle():
    async def scenario():
        stream = event_stream(FakeRequest(), EventBus(), ping_seconds=0.01)
        await stream.__anext__()
        assert await stream.__anext__() == ": ping\n\n"
        await stream.aclose()

    asyncio.run(scenario())


def test_stream_stops_when_client_disconnects():
    async def scenario():
        bus, request = EventBus(), FakeRequest()
        stream = event_stream(request, bus, ping_seconds=0.01)
        await stream.__anext__()
        request.disconnected = True
        remaining = [frame async for frame in stream]
        assert remaining == []
        assert bus.subscriber_count == 0

    asyncio.run(scenario())
