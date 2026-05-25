import base64
import json
from typing import Annotated, Any, Generic, TypeVar

from annotated_doc import Doc
from fastapi import Query
from pydantic import BaseModel
from typing_extensions import Doc as ExtDoc


T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    """
    A standardized paginated response that wraps any Pydantic model type.

    ## Example

    ```python
    from fastapi import FastAPI
    from fastapi.pagination import OffsetPaginator, PaginatedResponse

    app = FastAPI()

    @app.get("/items/", response_model=PaginatedResponse[Item])
    def list_items(paginator: OffsetPaginator):
        items = db.query(Item).offset(paginator.offset).limit(paginator.page_size).all()
        total = db.query(Item).count()
        return paginator.build_response(items, total)
    ```
    """

    items: Annotated[
        list[T],
        ExtDoc("The list of items for the current page."),
    ]
    total: Annotated[
        int,
        ExtDoc("The total number of items across all pages."),
    ]
    page: Annotated[
        int,
        ExtDoc("The current page number (1-indexed)."),
    ]
    page_size: Annotated[
        int,
        ExtDoc("The number of items per page."),
    ]
    total_pages: Annotated[
        int,
        ExtDoc("The total number of pages."),
    ]
    has_next: Annotated[
        bool,
        ExtDoc("Whether there is a next page."),
    ]
    has_previous: Annotated[
        bool,
        ExtDoc("Whether there is a previous page."),
    ]




class OffsetPaginator:
    """
    Offset-based pagination helper.

    Accepts `page` and `page_size` query parameters via FastAPI dependency injection
    and provides computed pagination metadata.

    ## Example

    ```python
    from fastapi import Depends
    from fastapi.pagination import OffsetPaginator, PaginatedResponse

    @app.get("/items/", response_model=PaginatedResponse[Item])
    def list_items(paginator: OffsetPaginator = Depends()):
        offset = paginator.offset
        limit = paginator.page_size
        items = db.query(Item).offset(offset).limit(limit).all()
        total = db.query(Item).count()
        return paginator.build_response(items, total)
    ```
    """

    def __init__(
        self,
        page: Annotated[
            int | None,
            Query(alias="page", ge=1, description="Page number (1-indexed)"),
            Doc("The page number to retrieve."),
        ] = None,
        page_size: Annotated[
            int | None,
            Query(alias="page_size", ge=1, le=100, description="Items per page"),
            Doc("The number of items per page."),
        ] = None,
        default_page_size: int = 20,
        default_page: int = 1,
    ):
        if page is None or page < 1:
            page = default_page
        if page_size is None or page_size < 1:
            page_size = default_page_size
        self.page = page
        self.page_size = page_size

    @property
    def offset(self) -> int:
        """The number of items to skip."""
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        """The number of items to take."""
        return self.page_size

    def build_response(
        self, items: list[Any], total: int
    ) -> PaginatedResponse[Any]:
        """
        Build a PaginatedResponse from a list of items and total count.

        Handles edge cases:
        - total == 0: total_pages = 0, has_next = False, has_previous = False
        - page > total_pages: returns last page behaviour
        """
        if total == 0:
            return PaginatedResponse(
                items=items,
                total=0,
                page=self.page,
                page_size=self.page_size,
                total_pages=0,
                has_next=False,
                has_previous=False,
            )
        # Clamp page to valid range
        actual_page = max(1, min(self.page, self._total_pages(total)))
        total_pages = self._total_pages(total)
        return PaginatedResponse(
            items=items,
            total=total,
            page=actual_page,
            page_size=self.page_size,
            total_pages=total_pages,
            has_next=actual_page < total_pages,
            has_previous=actual_page > 1,
        )

    def _total_pages(self, total: int) -> int:
        """Calculate total number of pages."""
        if total == 0:
            return 0
        return (total + self.page_size - 1) // self.page_size


def paginate(
    page: Annotated[
        int | None,
        Query(alias="page", ge=1, description="Page number (1-indexed)"),
    ] = None,
    page_size: Annotated[
        int | None,
        Query(alias="page_size", ge=1, le=100, description="Items per page"),
    ] = None,
    default_page_size: int = 20,
    default_page: int = 1,
) -> OffsetPaginator:
    """
    A FastAPI dependency that provides OffsetPaginator from query parameters.

    ## Example

    ```python
    from fastapi import Depends

    @app.get("/items/")
    def list_items(paginator: OffsetPaginator = Depends(paginate)):
        ...
    ```
    """
    return OffsetPaginator(
        page=page,
        page_size=page_size,
        default_page=default_page,
        default_page_size=default_page_size,
    )


class CursorPaginator:
    """
    Cursor-based pagination helper.

    Uses an encoded cursor to navigate pages. Cursor encodes the position
    (after/before) and is base64 URL-safe encoded.

    ## Example

    ```python
    from fastapi import Depends
    from fastapi.pagination import CursorPaginator, PaginatedResponse

    @app.get("/items/", response_model=PaginatedResponse[Item])
    def list_items(
        paginator: CursorPaginator = Depends(),
        after: str | None = None,
        before: str | None = None,
        first: int = 20,
    ):
        items = db.query(Item).filter(...).limit(first + 1).all()
        return paginator.build_response(items, first)
    ```
    """

    def __init__(
        self,
        after: Annotated[
            str | None,
            Query(alias="after", description="Cursor for forward pagination"),
            Doc("Cursor for forward pagination (after the last item)."),
        ] = None,
        before: Annotated[
            str | None,
            Query(alias="before", description="Cursor for backward pagination"),
            Doc("Cursor for backward pagination (before the first item)."),
        ] = None,
        first: Annotated[
            int | None,
            Query(alias="first", ge=1, le=100, description="Items per page"),
            Doc("Number of items to return."),
        ] = None,
        last: Annotated[
            int | None,
            Query(alias="last", ge=1, le=100, description="Items to return from end"),
            Doc("Number of items to return from the end (backward pagination)."),
        ] = None,
    ):
        self.after = after
        self.before = before
        self.first = first
        self.last = last

    @staticmethod
    def encode_cursor(position: dict[str, Any]) -> str:
        """
        Encode a position dict as a URL-safe base64 cursor string.
        """
        json_str = json.dumps(position, separators=(",", ":"))
        return base64.urlsafe_b64encode(json_str.encode()).decode()

    @staticmethod
    def decode_cursor(cursor: str) -> dict[str, Any]:
        """
        Decode a URL-safe base64 cursor string back to a position dict.
        Returns empty dict on invalid cursor.
        """
        try:
            padding = 4 - len(cursor) % 4
            if padding != 4:
                cursor += "=" * padding
            json_str = base64.urlsafe_b64decode(cursor.encode()).decode()
            return json.loads(json_str)
        except Exception:
            return {}

    def build_response(
        self, items: list[Any], requested_limit: int
    ) -> PaginatedResponse[Any]:
        """
        Build a PaginatedResponse from a list of items and the requested limit.

        Handles edge cases:
        - empty results
        - forward pagination (after cursor)
        - backward pagination (before cursor)
        """
        has_next = len(items) > requested_limit
        has_prev = self.after is not None or self.before is not None
        if has_next:
            items = items[:requested_limit]
        return PaginatedResponse(
            items=items,
            total=-1,  # Cursor pagination doesn't provide total by default
            page=-1,   # Cursor pagination uses -1 to indicate cursor mode
            page_size=requested_limit,
            total_pages=-1,
            has_next=has_next,
            has_previous=has_prev,
        )
