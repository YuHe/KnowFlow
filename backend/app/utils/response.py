from __future__ import annotations

from typing import Any, Optional

from fastapi.responses import JSONResponse


def ok(data: Any = None) -> dict:
    return {"success": True, "data": data, "error": None}


def err(code: str, message: str, status_code: int = 400) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "success": False,
            "data": None,
            "error": {"code": code, "message": message},
        },
    )


def paginate(
    items: list,
    total: int,
    page: int,
    page_size: int,
) -> dict:
    import math

    total_pages = math.ceil(total / page_size) if page_size > 0 else 0
    return ok(
        {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
        }
    )
