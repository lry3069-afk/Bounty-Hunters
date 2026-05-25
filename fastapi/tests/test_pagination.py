import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel

from fastapi.pagination import (
    CursorPaginator,
    OffsetPaginator,
    PaginatedResponse,
    paginate,
)


# --- Test data models ---


class Item(BaseModel):
    id: int
    name: str


# --- Test OffsetPaginator ---


def test_offset_paginator_defaults():
    paginator = OffsetPaginator(page=None, page_size=None)
    assert paginator.page == 1
    assert paginator.page_size == 20
    assert paginator.offset == 0
    assert paginator.limit == 20


def test_offset_paginator_custom_defaults():
    paginator = OffsetPaginator(
        page=None, page_size=None, default_page=3, default_page_size=50
    )
    assert paginator.page == 3
    assert paginator.page_size == 50
    assert paginator.offset == 100  # (3-1) * 50


def test_offset_paginator_negative_page_clamps_to_default():
    paginator = OffsetPaginator(page=-5, page_size=10)
    assert paginator.page == 1
    assert paginator.offset == 0


def test_offset_paginator_zero_page_size_clamps_to_default():
    paginator = OffsetPaginator(page=2, page_size=0)
    assert paginator.page_size == 20  # default


def test_offset_paginator_offset_limit():
    paginator = OffsetPaginator(page=3, page_size=15)
    assert paginator.offset == 30  # (3-1) * 15
    assert paginator.limit == 15


def test_build_response_basic():
    paginator = OffsetPaginator(page=2, page_size=10)
    items = [{"id": 1, "name": "a"}] * 10
    total = 55
    resp = paginator.build_response(items, total)
    assert resp.items == items
    assert resp.total == 55
    assert resp.page == 2
    assert resp.page_size == 10
    assert resp.total_pages == 6
    assert resp.has_next is True
    assert resp.has_previous is True


def test_build_response_first_page():
    paginator = OffsetPaginator(page=1, page_size=10)
    items = [{"id": 1, "name": "a"}] * 10
    resp = paginator.build_response(items, total=55)
    assert resp.page == 1
    assert resp.has_next is True
    assert resp.has_previous is False


def test_build_response_last_page():
    paginator = OffsetPaginator(page=6, page_size=10)
    items = [{"id": 1, "name": "a"}] * 5
    resp = paginator.build_response(items, total=55)
    assert resp.has_next is False
    assert resp.has_previous is True
    assert resp.total_pages == 6


def test_build_response_empty_results():
    paginator = OffsetPaginator(page=1, page_size=10)
    resp = paginator.build_response([], total=0)
    assert resp.items == []
    assert resp.total == 0
    assert resp.total_pages == 0
    assert resp.has_next is False
    assert resp.has_previous is False


def test_build_response_page_beyond_total():
    paginator = OffsetPaginator(page=99, page_size=10)
    items = [{"id": 1, "name": "a"}] * 5
    resp = paginator.build_response(items, total=55)
    # page should be clamped to last page
    assert resp.page == 6
    assert resp.has_next is False
    assert resp.has_previous is True


def test_total_pages_calculation():
    paginator = OffsetPaginator(page=1, page_size=10)
    assert paginator._total_pages(100) == 10
    assert paginator._total_pages(55) == 6
    assert paginator._total_pages(0) == 0
    assert paginator._total_pages(10) == 1
    assert paginator._total_pages(11) == 2


# --- Test CursorPaginator ---


def test_cursor_encode_decode():
    position = {"id": 42, "name": "test"}
    cursor = CursorPaginator.encode_cursor(position)
    decoded = CursorPaginator.decode_cursor(cursor)
    assert decoded == position


def test_cursor_encode_decode_roundtrip():
    for data in [
        {"id": 0},
        {"id": -1},
        {"name": "hello world"},
        {"a": 1, "b": 2, "c": 3},
        {},
    ]:
        encoded = CursorPaginator.encode_cursor(data)
        decoded = CursorPaginator.decode_cursor(encoded)
        assert decoded == data


def test_cursor_decode_invalid_returns_empty():
    assert CursorPaginator.decode_cursor("not-valid-base64!!!") == {}
    assert CursorPaginator.decode_cursor("") == {}


def test_cursor_build_response_forward():
    paginator = CursorPaginator(after="abc123", first=10)
    items = [{"id": i} for i in range(11)]  # 11 items, 1 more than requested
    resp = paginator.build_response(items, 10)
    assert len(resp.items) == 10  # extra item trimmed
    assert resp.has_next is True
    assert resp.has_previous is True


def test_cursor_build_response_exact_fit():
    paginator = CursorPaginator(first=10)
    items = [{"id": i} for i in range(10)]
    resp = paginator.build_response(items, 10)
    assert len(resp.items) == 10
    assert resp.has_next is False
    assert resp.has_previous is False


def test_cursor_build_response_empty():
    paginator = CursorPaginator(first=10)
    resp = paginator.build_response([], 10)
    assert resp.items == []
    assert resp.has_next is False
    assert resp.has_previous is False


def test_cursor_backward_pagination():
    paginator = CursorPaginator(before="xyz789", first=10)
    items = [{"id": i} for i in range(10)]
    resp = paginator.build_response(items, 10)
    # has_previous True because we have a 'before' cursor indicating backward pagination
    assert resp.has_previous is True
    assert resp.has_next is False


# --- Test paginate dependency ---


def test_paginate_dependency():
    app = FastAPI()

    @app.get("/items/")
    def list_items(paginator: OffsetPaginator = Depends(paginate)):
        return {
            "page": paginator.page,
            "page_size": paginator.page_size,
            "offset": paginator.offset,
        }

    client = TestClient(app)
    resp = client.get("/items/?page=3&page_size=15")
    assert resp.status_code == 200
    data = resp.json()
    assert data["page"] == 3
    assert data["page_size"] == 15
    assert data["offset"] == 30


def test_paginate_dependency_defaults():
    app = FastAPI()

    @app.get("/items/")
    def list_items(paginator: OffsetPaginator = Depends(paginate)):
        return {"page": paginator.page, "page_size": paginator.page_size}

    client = TestClient(app)
    resp = client.get("/items/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["page"] == 1
    assert data["page_size"] == 20


# --- Test PaginatedResponse generic type ---


def test_paginated_response_generic():
    items = [Item(id=1, name="test")]
    resp = PaginatedResponse[Item](
        items=items,
        total=1,
        page=1,
        page_size=20,
        total_pages=1,
        has_next=False,
        has_previous=False,
    )
    assert resp.items == items
    assert isinstance(resp.items[0], Item)


# --- Integration tests with FastAPI routes ---


def test_offset_pagination_route():
    app = FastAPI()

    DB = [{"id": i, "name": f"item_{i}"} for i in range(1, 101)]

    @app.get("/items/", response_model=PaginatedResponse[dict])
    def list_items(paginator: OffsetPaginator = Depends(paginate)):
        offset = paginator.offset
        limit = paginator.limit
        page_items = DB[offset : offset + limit]
        return paginator.build_response(page_items, total=len(DB))

    client = TestClient(app)

    # Page 1
    resp = client.get("/items/?page=1&page_size=10")
    assert resp.status_code == 200
    data = resp.json()
    assert data["page"] == 1
    assert data["page_size"] == 10
    assert len(data["items"]) == 10
    assert data["total"] == 100
    assert data["total_pages"] == 10
    assert data["has_next"] is True
    assert data["has_previous"] is False

    # Last page
    resp = client.get("/items/?page=10&page_size=10")
    data = resp.json()
    assert data["has_next"] is False
    assert data["has_previous"] is True
    assert len(data["items"]) == 10

    # Empty page (beyond total)
    resp = client.get("/items/?page=99&page_size=10")
    data = resp.json()
    assert data["page"] == 10  # clamped
    assert data["has_next"] is False


def test_cursor_pagination_route():
    app = FastAPI()

    DB = [{"id": i, "name": f"item_{i}"} for i in range(1, 101)]

    @app.get("/items/", response_model=PaginatedResponse[dict])
    def list_items(
        paginator: CursorPaginator = Depends(),
        after: str | None = None,
        before: str | None = None,
        first: int = 20,
    ):
        # Simple after-based: filter items after cursor
        start_idx = 0
        if after:
            pos = CursorPaginator.decode_cursor(after)
            start_idx = pos.get("idx", 0) + 1
        # Fetch one extra to detect has_next
        items = DB[start_idx : start_idx + first + 1]
        return paginator.build_response(items, first)

    client = TestClient(app)
    # DB has 100 items, requesting first=10, has_next=True
    resp = client.get("/items/?first=10")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 10
    assert data["has_next"] is True


# --- Edge cases ---


def test_page_zero():
    """page=0 is rejected by FastAPI Query(ge=1) validation."""
    app = FastAPI()

    @app.get("/items/")
    def list_items(paginator: OffsetPaginator = Depends(paginate)):
        return {"page": paginator.page}

    client = TestClient(app)
    # FastAPI's Query(ge=1) rejects page=0 with 422
    resp = client.get("/items/?page=0")
    assert resp.status_code == 422


def test_page_size_zero():
    """page_size=0 is rejected by FastAPI Query(ge=1) validation."""
    app = FastAPI()

    @app.get("/items/")
    def list_items(paginator: OffsetPaginator = Depends(paginate)):
        return {"page_size": paginator.page_size}

    client = TestClient(app)
    # FastAPI's Query(ge=1) rejects page_size=0 with 422
    resp = client.get("/items/?page_size=0")
    assert resp.status_code == 422
