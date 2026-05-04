from __future__ import annotations

from datetime import datetime
import json
from pathlib import Path
from threading import Lock
from typing import Any, Literal

from app.core.config import is_debug_enabled
from app.storage.paths import get_logs_dir

DebugModule = Literal["backend", "frontend"]
DebugCategory = Literal["system", "http", "LLM"]

_LOG_LOCK = Lock()
_SECRET_KEY_PARTS = ("authorization", "api_key", "apikey", "password", "secret", "token", "cookie")
_MAX_STRING_LENGTH = 20_000


def debug_log(
    module: DebugModule,
    category: DebugCategory,
    operation: str,
    payload: dict[str, Any] | None = None,
    *,
    force: bool = False,
) -> None:
    if not force and not is_debug_enabled():
        return

    now = datetime.now().astimezone()
    entry = {
        "timestamp": _readable_timestamp(now),
        "module": module,
        "category": category,
        "operation": operation,
        "payload": _sanitize(payload or {}),
    }
    path = _log_path(now)
    path.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(entry, ensure_ascii=False, default=str)
    with _LOG_LOCK:
        with path.open("a", encoding="utf-8") as handle:
            handle.write(f"{line}\n")


def _log_path(now: datetime) -> Path:
    return get_logs_dir() / f"app-{now:%Y-%m-%d}.jsonl"


def _readable_timestamp(now: datetime) -> str:
    return f"{now:%Y-%m-%d %H:%M:%S}.{now.microsecond // 1000:03d} {now:%z}"


def _sanitize(value: Any, *, key: str | None = None, depth: int = 0) -> Any:
    if key and _is_secret_key(key):
        return "[redacted]"
    if depth > 8:
        return repr(value)
    if value is None or isinstance(value, bool | int | float):
        return value
    if isinstance(value, str):
        if len(value) <= _MAX_STRING_LENGTH:
            return value
        return f"{value[:_MAX_STRING_LENGTH]}...[truncated {len(value) - _MAX_STRING_LENGTH} chars]"
    if isinstance(value, dict):
        return {
            str(item_key): _sanitize(item_value, key=str(item_key), depth=depth + 1)
            for item_key, item_value in value.items()
        }
    if isinstance(value, list | tuple):
        return [_sanitize(item, depth=depth + 1) for item in value]
    if hasattr(value, "model_dump"):
        return _sanitize(value.model_dump(), depth=depth + 1)
    return repr(value)


def _is_secret_key(key: str) -> bool:
    lowered = key.lower()
    return any(part in lowered for part in _SECRET_KEY_PARTS)
