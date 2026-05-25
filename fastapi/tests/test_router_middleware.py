"""Tests for APIRouter middleware support (Issue #796)."""
from typing import Callable

import pytest
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from starlette.testclient import TestClient

from fastapi import FastAPI, APIRouter
from fastapi.testclient import TestClient as FastAPITestClient


class OrderMiddleware(BaseHTTPMiddleware):
    """Simple middleware that tracks call order."""
    calls: list[str] = []

    async def dispatch(self, request, call_next):
        OrderMiddleware.calls.append("middleware")
        response = await call_next(request)
        return response


class HeaderMiddleware(BaseHTTPMiddleware):
    """Middleware that adds a header."""
    def __init__(self, app, header_value: str = "applied"):
        super().__init__(app)
        self.header_value = header_value

    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Middleware"] = self.header_value
        return response


def test_router_init_middleware_parameter():
    """Test that APIRouter accepts middleware in __init__."""
    router = APIRouter(middleware=[HeaderMiddleware])
    assert router.middleware is not None
    assert len(router.middleware) == 1


def test_router_init_middleware_none():
    """Test that APIRouter with no middleware."""
    router = APIRouter()
    assert router.middleware == []


def test_add_middleware_method():
    """Test the add_middleware() convenience method."""
    router = APIRouter()
    router.add_middleware(HeaderMiddleware, header_value="custom")

    assert len(router.middleware) == 1
    mw = router.middleware[0]
    assert isinstance(mw, HeaderMiddleware)
    assert mw.header_value == "custom"


def test_add_middleware_after_routes():
    """Test that add_middleware works after routes are registered."""
    app = FastAPI()
    router = APIRouter()

    @router.get("/items/")
    def read_items():
        return {"item": "data"}

    app.include_router(router)
    router.add_middleware(HeaderMiddleware)

    # Should not raise
    client = FastAPITestClient(app)
    response = client.get("/items/")
    assert response.status_code == 200


def test_include_router_middleware_parameter():
    """Test that include_router accepts middleware parameter."""
    app = FastAPI()
    router = APIRouter()

    @router.get("/items/")
    def read_items():
        return {"item": "data"}

    app.include_router(router, middleware=[HeaderMiddleware])

    client = FastAPITestClient(app)
    response = client.get("/items/")
    assert response.status_code == 200
    assert response.headers.get("X-Middleware") == "applied"


def test_child_router_middleware_scope():
    """Test that child router middleware only affects child's routes."""
    app = FastAPI()
    child_router = APIRouter(middleware=[HeaderMiddleware])

    @child_router.get("/child/")
    def child_route():
        return {"route": "child"}

    @app.get("/parent/")
    def parent_route():
        return {"route": "parent"}

    app.include_router(child_router, prefix="/api")

    client = FastAPITestClient(app)
    child_resp = client.get("/api/child/")
    assert child_resp.headers.get("X-Middleware") == "applied"

    parent_resp = client.get("/parent/")
    assert "X-Middleware" not in parent_resp.headers


def test_multiple_middleware_order():
    """Test that middleware is applied in correct order (LIFO)."""
    call_order: list[int] = []

    class Middleware1(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            call_order.append(1)
            return await call_next(request)

    class Middleware2(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            call_order.append(2)
            return await call_next(request)

    router = APIRouter(middleware=[Middleware1, Middleware2])

    @router.get("/test/")
    def test_route():
        return {"ok": True}

    app = FastAPI()
    app.include_router(router)

    client = FastAPITestClient(app)
    client.get("/test/")

    # Middleware added in order: Middleware1 first, Middleware2 second
    # Applied in reverse (LIFO): Middleware2 runs first
    assert call_order == [2, 1]
