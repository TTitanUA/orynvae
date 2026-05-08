from __future__ import annotations

import sqlite3

from fastapi import HTTPException, status

from app.models.runtime import RuntimeModelReference, RuntimeProviderReference, RuntimeStatus
from app.storage.migrations import apply_migrations
from app.storage.paths import get_database_path

READ_ONLY_ERROR_CODE = "READ_ONLY_WITHOUT_AI"


def _connection() -> sqlite3.Connection:
    apply_migrations()
    connection = sqlite3.connect(get_database_path())
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _bool(value: object) -> bool:
    return bool(int(value)) if isinstance(value, int) else bool(value)


def _provider_from_row(row: sqlite3.Row) -> RuntimeProviderReference:
    return RuntimeProviderReference(
        id=row["id"],
        type=row["type"],
        name=row["name"],
        is_external=not _bool(row["is_local"]),
        is_enabled=_bool(row["is_enabled"]),
        last_checked_at=row["last_checked_at"],
        last_error=row["last_error"],
    )


def _model_from_row(row: sqlite3.Row) -> RuntimeModelReference:
    return RuntimeModelReference(
        id=row["id"],
        provider_id=row["provider_id"],
        model_id=row["model_id"],
        display_name=row["display_name"],
        supports_streaming=_bool(row["supports_streaming"]),
        is_allowed=_bool(row["is_allowed"]),
    )


def get_runtime_status(project_id: str | None = None) -> RuntimeStatus:
    with _connection() as connection:
        project_row = _load_project(connection, project_id) if project_id else None
        provider_row = _load_active_provider(connection, project_row)
        if provider_row is None:
            return _blocked("AI provider is not configured")

        provider = _provider_from_row(provider_row)
        if not provider.is_enabled:
            return _blocked("AI provider is disabled", provider=provider)
        if provider.last_error:
            return _blocked(provider.last_error, provider=provider)

        model_id = _active_model_id(provider_row, project_row)
        if not model_id:
            return _blocked("AI model is not selected", provider=provider)

        model_row = connection.execute(
            """
            SELECT id, provider_id, model_id, display_name, supports_streaming, is_allowed
            FROM provider_models
            WHERE provider_id = ? AND model_id = ?
            """,
            (provider.id, model_id),
        ).fetchone()
        if model_row is None:
            return _blocked("Selected AI model is not known", provider=provider)

        model = _model_from_row(model_row)
        if not model.is_allowed:
            return _blocked("Selected AI model is not allowed", provider=provider, model=model)

        return RuntimeStatus(
            read_only=False,
            ai_available=True,
            active_provider=provider,
            active_model=model,
        )


def require_creative_write(project_id: str | None = None) -> None:
    runtime = get_runtime_status(project_id)
    if runtime.ai_available:
        return
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "code": READ_ONLY_ERROR_CODE,
            "message": runtime.reason or "AI provider is required for creative changes",
        },
    )


def _blocked(
    reason: str,
    *,
    provider: RuntimeProviderReference | None = None,
    model: RuntimeModelReference | None = None,
) -> RuntimeStatus:
    return RuntimeStatus(
        read_only=True,
        ai_available=False,
        reason=reason,
        active_provider=provider,
        active_model=model,
    )


def _load_project(connection: sqlite3.Connection, project_id: str | None) -> sqlite3.Row | None:
    if not project_id:
        return None
    return connection.execute(
        """
        SELECT active_provider_id, active_model_id
        FROM projects
        WHERE id = ? AND archived_at IS NULL
        """,
        (project_id,),
    ).fetchone()


def _load_active_provider(
    connection: sqlite3.Connection,
    project_row: sqlite3.Row | None,
) -> sqlite3.Row | None:
    if project_row and project_row["active_provider_id"]:
        return connection.execute(
            """
            SELECT *
            FROM model_providers
            WHERE id = ?
            """,
            (project_row["active_provider_id"],),
        ).fetchone()

    return connection.execute(
        """
        SELECT *
        FROM model_providers
        WHERE is_default = 1
        ORDER BY updated_at DESC
        LIMIT 1
        """
    ).fetchone()


def _active_model_id(provider_row: sqlite3.Row, project_row: sqlite3.Row | None) -> str | None:
    if project_row and project_row["active_model_id"]:
        return project_row["active_model_id"]
    model_id = provider_row["default_model_id"]
    return model_id if isinstance(model_id, str) and model_id else None
