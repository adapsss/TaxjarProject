"""The single error format: every error leaves as {"error": {"code", "message"}}.

Raise ApiError(status, code, message) anywhere in the backend; validation errors,
unknown routes and crashes are converted by the handlers registered here.
"""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def error_response(status: int, code: str, message: str, headers=None) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}}, headers=headers)


# Routes do not declare these responses in OpenAPI on purpose: the generated
# frontend/src/api/schema.d.ts is frozen with the contract. client.ts reads
# {"error": {"code", "message"}} from any failed response.

_HTTP_CODES = {400: "bad_request", 404: "not_found", 405: "method_not_allowed"}
_LOCATION_PREFIXES = ("body", "query", "path", "header")


def _validation_message(exc: RequestValidationError) -> str:
    errors = exc.errors()
    if not errors:
        return "Invalid request"
    first = errors[0]
    where = ".".join(str(part) for part in first.get("loc", ()) if part not in _LOCATION_PREFIXES)
    message = first.get("msg", "Invalid value")
    return f"{where}: {message}" if where else message


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def handle_api_error(request: Request, exc: ApiError) -> JSONResponse:
        return error_response(exc.status, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        return error_response(422, "validation_error", _validation_message(exc))

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _HTTP_CODES.get(exc.status_code, "http_error")
        return error_response(exc.status_code, code, str(exc.detail), headers=getattr(exc, "headers", None))

    # A fallback: app/request_log.py answers crashes first (with the request id) when it is installed.
    @app.exception_handler(Exception)
    async def handle_crash(request: Request, exc: Exception) -> JSONResponse:
        if not getattr(exc, "logged_with_request_id", False):
            logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return error_response(500, "internal_error", "Something went wrong on our side.")
