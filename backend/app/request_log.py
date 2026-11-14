"""One log line per request, and a request id on every response and every log record.

The id comes from the caller's X-Request-ID when it sent a plain one, else it is generated here;
it goes back in the X-Request-ID response header, so a report from the browser can be matched to
the server's log lines. Pure ASGI (no response buffering): the event stream passes through as is.

A crash is answered here too. Starlette would answer it outside this middleware, where the id is
already gone, and the 500s are the responses most worth tracing.
"""
import contextvars
import logging
import re
import time
import uuid

from app.errors import error_response

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

        # The path is the client's text: escaped, so a line break in it cannot fake a log line.
        path = scope["path"].encode("unicode_escape").decode("ascii")
        started_response = False

        def log_line(note: str = "") -> None:
            level = logging.DEBUG if scope["path"] in _QUIET_PATHS else logging.INFO
            logger.log(
                level, "%s %s %s %.0fms%s", scope["method"], path, status["code"],
                (time.monotonic() - started) * 1000, note,
            )

        async def send_with_id(message) -> None:
            nonlocal announced, started_response
            if message["type"] == "http.response.start":
                started_response = True
                status["code"] = message["status"]
                message = dict(message, headers=[*message.get("headers", []), (b"x-request-id", request_id.encode())])
                if any(k == b"content-type" and v.startswith(b"text/event-stream") for k, v in message["headers"]):
                    # A stream stays open for hours: say that it opened now, and that it closed later.
                    announced = True
                    log_line(" stream opened")
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        except Exception as exc:
            logger.exception("Unhandled error on %s %s", scope["method"], path)
            exc.logged_with_request_id = True  # errors.handle_crash then stays quiet
            if not started_response:
                await error_response(500, "internal_error", "Something went wrong on our side.")(
                    scope, receive, send_with_id
                )
            raise  # the server still records the crash; the client already has its answer
        finally:
            log_line(" stream closed" if announced else "")
            _request_id.reset(token)
