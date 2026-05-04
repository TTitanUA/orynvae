from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Response, status
from pydantic import BaseModel, Field

from app.core.config import is_debug_enabled
from app.core.debug_logging import debug_log

router = APIRouter(prefix="/debug", tags=["debug"])


class DebugLogStatus(BaseModel):
    enabled: bool


class FrontendDebugLogEntry(BaseModel):
    timestamp: str | None = None
    module: Literal["frontend"] = "frontend"
    category: Literal["system", "http", "LLM"]
    operation: str = Field(min_length=1, max_length=160)
    payload: dict[str, Any] = Field(default_factory=dict)


class FrontendDebugLogBatch(BaseModel):
    entries: list[FrontendDebugLogEntry] = Field(min_length=1, max_length=100)


@router.get("/logs", response_model=DebugLogStatus)
def get_debug_log_status() -> DebugLogStatus:
    return DebugLogStatus(enabled=is_debug_enabled())


@router.post("/logs", status_code=status.HTTP_204_NO_CONTENT)
def post_frontend_debug_logs(payload: FrontendDebugLogBatch) -> Response:
    if not is_debug_enabled():
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    for entry in payload.entries:
        debug_log(
            "frontend",
            entry.category,
            entry.operation,
            {
                "frontend_timestamp": entry.timestamp,
                **entry.payload,
            },
            force=True,
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
