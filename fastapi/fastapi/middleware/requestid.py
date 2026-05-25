import logging
from contextvars import ContextVar
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from uuid import uuid4

from fastapi.logger import logger

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)


def get_request_id() -> str | None:
    """Get the current request ID from the context variable."""
    return request_id_var.get()


class RequestIDFilter(logging.Filter):
    """Logging filter that injects the current request ID into log records."""

    def filter(self, record: logging.LogRecord) -> bool:
        request_id = request_id_var.get()
        if request_id:
            record.request_id = request_id
        else:
            record.request_id = "-"
        return True


# Attach filter to the fastapi logger (and root handler if present)
_fastapi_logger = logging.getLogger("fastapi")
_fastapi_logger.addFilter(RequestIDFilter())

# Also attach to root logger handlers so all log calls during a request include the ID
_root = logging.getLogger()
_root.addFilter(RequestIDFilter())


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Middleware that generates a unique request ID for each incoming request.

    - Uses client-supplied X-Request-ID header if present, otherwise generates a UUID.
    - Stores the request ID in request.state for access in route handlers.
    - Adds X-Request-ID to the response headers.
    - Injects request ID into all log messages during the request lifecycle via contextvars.
    - Uses contextvars so concurrent requests never share or leak request IDs.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Prefer client-supplied X-Request-ID, otherwise generate a UUID
        client_request_id = request.headers.get("x-request-id")
        request_id = client_request_id if client_request_id else str(uuid4())

        # Store in request.state so route handlers can access it
        request.state.request_id = request_id

        # Bind request ID to this async context; reset after the request
        token = request_id_var.set(request_id)

        try:
            response = await call_next(request)
        finally:
            request_id_var.reset(token)

        # Always echo back the request ID in the response
        response.headers["X-Request-ID"] = request_id
        return response
