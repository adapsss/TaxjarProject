"""One log line per request, and a request id on every response and every log record.

The id comes from the caller's X-Request-ID when it sent a plain one, else it is generated here;
it goes back in the X-Request-ID response header, so a report from the browser can be matched to
the server's log lines. Pure ASGI (no response buffering): the event stream passes through as is.
"""
import contextvars
import logging
import re
import time
import uuid

logger = logging.getLogger("app.request")

_request_id: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")
_SAFE_ID = re.compile(r"[A-Za-z0-9._-]{1,64}")
_QUIET_PATHS = ("/api/healthz",)  # probed every few seconds: logged at DEBUG only


def current_request_id() -> str:
    return _request_id.get()


class RequestIdFilter(logging.Filter):
    """Adds `request_id` to every record, so the log format can print it ("-" outside a request)."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = _request_id.get()
        return True


class RequestLogMiddleware:
    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        given = dict(scope["headers"]).get(b"x-request-id", b"").decode("latin-1")
        request_id = given if _SAFE_ID.fullmatch(given) else uuid.uuid4().hex
        token = _request_id.set(request_id)
        started = time.monotonic()
        status = {"code": 500}  # what the client gets if the app dies before answering
        announced = False

        def log_line(note: str = "") -> None:
            level = logging.DEBUG if scope["path"] in _QUIET_PATHS else logging.INFO
            logger.log(
                level, "%s %s %s %.0fms%s", scope["method"], scope["path"], status["code"],
                (time.monotonic() - started) * 1000, note,
            )

        async def send_with_id(message) -> None:
            nonlocal announced
            if message["type"] == "http.response.start":
                status["code"] = message["status"]
                message = dict(message, headers=[*message.get("headers", []), (b"x-request-id", request_id.encode())])
                if any(k == b"content-type" and v.startswith(b"text/event-stream") for k, v in message["headers"]):
                    # A stream stays open for hours: say that it opened now, and that it closed later.
                    announced = True
                    log_line(" stream opened")
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            log_line(" stream closed" if announced else "")
            _request_id.reset(token)
