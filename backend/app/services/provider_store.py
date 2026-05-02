from __future__ import annotations

from dataclasses import dataclass
import json
import sqlite3
from uuid import uuid4

from app.models.providers import (
    ProjectModelSelection,
    ProviderCreate,
    ProviderModelRecord,
    ProviderRecord,
    ProviderUpdate,
)
from app.providers.adapters import PROVIDER_DEFINITIONS, ProviderModel
from app.storage.migrations import apply_migrations
from app.storage.paths import get_database_path


@dataclass(frozen=True)
class StoredProvider:
    provider: ProviderRecord
    api_key: str | None


def _connection() -> sqlite3.Connection:
    apply_migrations()
    connection = sqlite3.connect(get_database_path())
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _bool(value: object) -> bool:
    return bool(int(value)) if isinstance(value, int) else bool(value)


def _provider_from_row(row: sqlite3.Row) -> ProviderRecord:
    return ProviderRecord(
        id=row["id"],
        type=row["type"],
        name=row["name"],
        base_url=row["base_url"],
        has_api_key=bool(row["api_key"]),
        is_local=_bool(row["is_local"]),
        is_external=not _bool(row["is_local"]),
        is_enabled=_bool(row["is_enabled"]),
        is_default=_bool(row["is_default"]),
        streaming_enabled=_bool(row["streaming_enabled"]),
        models_path=row["models_path"],
        chat_path=row["chat_path"],
        default_model_id=row["default_model_id"],
        last_checked_at=row["last_checked_at"],
        last_error=row["last_error"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _model_from_row(row: sqlite3.Row) -> ProviderModelRecord:
    capabilities = {}
    if row["capabilities_json"]:
        capabilities = json.loads(row["capabilities_json"])
    return ProviderModelRecord(
        id=row["id"],
        provider_id=row["provider_id"],
        model_id=row["model_id"],
        display_name=row["display_name"],
        supports_streaming=_bool(row["supports_streaming"]),
        context_window=row["context_window"],
        capabilities=capabilities,
        last_seen_at=row["last_seen_at"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def list_providers() -> list[ProviderRecord]:
    with _connection() as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM model_providers
            ORDER BY is_default DESC, is_enabled DESC, updated_at DESC, name ASC
            """
        ).fetchall()
    return [_provider_from_row(row) for row in rows]


def list_models(provider_id: str) -> list[ProviderModelRecord]:
    with _connection() as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM provider_models
            WHERE provider_id = ?
            ORDER BY display_name ASC
            """,
            (provider_id,),
        ).fetchall()
    return [_model_from_row(row) for row in rows]


def get_provider(provider_id: str) -> StoredProvider | None:
    with _connection() as connection:
        row = connection.execute(
            "SELECT * FROM model_providers WHERE id = ?",
            (provider_id,),
        ).fetchone()
    if row is None:
        return None
    return StoredProvider(provider=_provider_from_row(row), api_key=row["api_key"])


def create_provider(payload: ProviderCreate) -> ProviderRecord:
    defaults = PROVIDER_DEFINITIONS[payload.type]
    provider_id = str(uuid4())
    base_url = payload.base_url or defaults.base_url
    models_path = payload.models_path if payload.models_path is not None else defaults.models_path
    chat_path = payload.chat_path if payload.chat_path is not None else defaults.chat_path
    is_local = defaults.is_local if payload.is_local is None else payload.is_local

    with _connection() as connection:
        provider_count = connection.execute(
            "SELECT COUNT(*) FROM model_providers"
        ).fetchone()
        is_default = payload.is_default or int(provider_count[0]) == 0
        if is_default:
            connection.execute("UPDATE model_providers SET is_default = 0")
        connection.execute(
            """
            INSERT INTO model_providers (
              id, type, name, base_url, api_key, is_local, is_enabled, is_default, streaming_enabled,
              models_path, chat_path, default_model_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                provider_id,
                payload.type,
                payload.name,
                base_url,
                payload.api_key,
                int(is_local),
                int(payload.is_enabled),
                int(is_default),
                int(payload.streaming_enabled),
                models_path,
                chat_path,
                payload.default_model_id,
            ),
        )
        connection.commit()

    stored = get_provider(provider_id)
    if stored is None:
        raise RuntimeError("Created provider could not be loaded")
    return stored.provider


def update_provider(provider_id: str, payload: ProviderUpdate) -> ProviderRecord | None:
    stored = get_provider(provider_id)
    if stored is None:
        return None

    values = payload.model_dump(exclude_unset=True)
    if not values:
        return stored.provider

    is_disabling_default = (
        values.get("is_enabled") is False
        and stored.provider.is_default
    )
    assignments: list[str] = []
    parameters: list[object] = []
    for key, value in values.items():
        if key in {"is_local", "is_enabled", "streaming_enabled"} and value is not None:
            value = int(value)
        assignments.append(f"{key} = ?")
        parameters.append(value)
    if is_disabling_default:
        assignments.append("is_default = 0")
    assignments.append("updated_at = CURRENT_TIMESTAMP")
    parameters.append(provider_id)

    with _connection() as connection:
        connection.execute(
            f"UPDATE model_providers SET {', '.join(assignments)} WHERE id = ?",
            parameters,
        )
        connection.commit()

    updated = get_provider(provider_id)
    return updated.provider if updated else None


def delete_provider(provider_id: str) -> bool:
    with _connection() as connection:
        cursor = connection.execute("DELETE FROM model_providers WHERE id = ?", (provider_id,))
        connection.commit()
    return cursor.rowcount > 0


def update_provider_check(provider_id: str, error: str | None) -> None:
    with _connection() as connection:
        connection.execute(
            """
            UPDATE model_providers
            SET last_checked_at = CURRENT_TIMESTAMP,
                last_error = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (error, provider_id),
        )
        connection.commit()


def upsert_models(provider_id: str, models: list[ProviderModel]) -> list[ProviderModelRecord]:
    with _connection() as connection:
        for model in models:
            connection.execute(
                """
                INSERT INTO provider_models (
                  id, provider_id, model_id, display_name, supports_streaming,
                  context_window, capabilities_json, last_seen_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(provider_id, model_id) DO UPDATE SET
                  display_name = excluded.display_name,
                  supports_streaming = excluded.supports_streaming,
                  context_window = excluded.context_window,
                  capabilities_json = excluded.capabilities_json,
                  last_seen_at = CURRENT_TIMESTAMP,
                  updated_at = CURRENT_TIMESTAMP
                """,
                (
                    str(uuid4()),
                    provider_id,
                    model.model_id,
                    model.display_name,
                    int(model.supports_streaming),
                    model.context_window,
                    json.dumps(model.capabilities or {}, ensure_ascii=True),
                ),
            )
        connection.commit()

    return list_models(provider_id)


def set_default_model(provider_id: str, model_id: str | None) -> ProviderRecord | None:
    with _connection() as connection:
        cursor = connection.execute(
            """
            UPDATE model_providers
            SET default_model_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (model_id, provider_id),
        )
        connection.commit()
    if cursor.rowcount == 0:
        return None
    stored = get_provider(provider_id)
    return stored.provider if stored else None


def set_default_provider(provider_id: str) -> ProviderRecord | None:
    stored = get_provider(provider_id)
    if stored is None:
        return None

    with _connection() as connection:
        connection.execute("UPDATE model_providers SET is_default = 0")
        connection.execute(
            """
            UPDATE model_providers
            SET is_default = 1,
                is_enabled = 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (provider_id,),
        )
        connection.commit()

    updated = get_provider(provider_id)
    return updated.provider if updated else None


def set_project_model(selection: ProjectModelSelection) -> ProjectModelSelection | None:
    with _connection() as connection:
        cursor = connection.execute(
            """
            UPDATE projects
            SET provider_id = ?, model_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (selection.provider_id, selection.model_id, selection.project_id),
        )
        connection.commit()
    return selection if cursor.rowcount else None
