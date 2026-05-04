from __future__ import annotations

from dataclasses import dataclass
import json
import sqlite3
from uuid import uuid4

from app.models.providers import (
    ProjectModelSelection,
    ProviderCreate,
    ProviderModelPreferencesUpdate,
    ProviderModelRecord,
    ProviderRecord,
    ProviderUpdate,
    ProviderWithModels,
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
    routing_config = None
    if row["routing_config_json"]:
        parsed = json.loads(row["routing_config_json"])
        routing_config = parsed if isinstance(parsed, dict) else None
    return ProviderModelRecord(
        id=row["id"],
        provider_id=row["provider_id"],
        model_id=row["model_id"],
        display_name=row["display_name"],
        supports_streaming=_bool(row["supports_streaming"]),
        context_window=row["context_window"],
        capabilities=capabilities,
        is_allowed=_bool(row["is_allowed"]),
        routing_config=routing_config,
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
            ORDER BY is_allowed DESC, display_name ASC
            """,
            (provider_id,),
        ).fetchall()
    return [_model_from_row(row) for row in rows]


def list_allowed_models(provider_id: str) -> list[ProviderModelRecord]:
    with _connection() as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM provider_models
            WHERE provider_id = ? AND is_allowed = 1
            ORDER BY display_name ASC
            """,
            (provider_id,),
        ).fetchall()
    return [_model_from_row(row) for row in rows]


def get_model(provider_id: str, model_id: str) -> ProviderModelRecord | None:
    with _connection() as connection:
        row = connection.execute(
            """
            SELECT *
            FROM provider_models
            WHERE provider_id = ? AND model_id = ?
            """,
            (provider_id, model_id),
        ).fetchone()
    return _model_from_row(row) if row else None


def get_allowed_model(provider_id: str, model_id: str) -> ProviderModelRecord | None:
    model = get_model(provider_id, model_id)
    return model if model and model.is_allowed else None


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
    if "default_model_id" in values and values["default_model_id"] is not None:
        _require_allowed_default(provider_id, str(values["default_model_id"]))

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
        provider_row = connection.execute(
            "SELECT default_model_id FROM model_providers WHERE id = ?",
            (provider_id,),
        ).fetchone()
        default_model_id = provider_row["default_model_id"] if provider_row else None
        for model in models:
            connection.execute(
                """
                INSERT INTO provider_models (
                  id, provider_id, model_id, display_name, supports_streaming,
                  context_window, capabilities_json, is_allowed, last_seen_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
                    int(model.model_id == default_model_id),
                ),
            )
        connection.commit()

    return list_models(provider_id)


def set_default_model(provider_id: str, model_id: str | None) -> ProviderRecord | None:
    stored = get_provider(provider_id)
    if stored is None:
        return None
    if model_id is not None:
        _require_allowed_default(provider_id, model_id)

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
    updated = get_provider(provider_id)
    return updated.provider if updated else None


def update_model_preferences(
    provider_id: str,
    payload: ProviderModelPreferencesUpdate,
) -> ProviderWithModels | None:
    with _connection() as connection:
        provider_row = connection.execute(
            "SELECT * FROM model_providers WHERE id = ?",
            (provider_id,),
        ).fetchone()
        if provider_row is None:
            return None

        model_rows = connection.execute(
            "SELECT * FROM provider_models WHERE provider_id = ?",
            (provider_id,),
        ).fetchall()
        models_by_id = {row["model_id"]: row for row in model_rows}
        missing_model_ids = [
            preference.model_id
            for preference in payload.models
            if preference.model_id not in models_by_id
        ]
        if missing_model_ids:
            raise ValueError(f"Unknown provider model: {missing_model_ids[0]}")

        final_allowed = {
            model_id: _bool(row["is_allowed"])
            for model_id, row in models_by_id.items()
        }
        for preference in payload.models:
            final_allowed[preference.model_id] = preference.is_allowed

        if payload.default_model_id is not None:
            if payload.default_model_id not in models_by_id:
                raise ValueError("Default model does not belong to this provider")
            if not final_allowed.get(payload.default_model_id, False):
                raise ValueError("Default model must be allowed")

        provider_type = provider_row["type"]
        for preference in payload.models:
            routing_json = None
            if preference.routing_config is not None:
                routing_config = preference.routing_config.to_provider_payload()
                if routing_config and provider_type != "openrouter":
                    raise ValueError("Routing config is only supported for OpenRouter providers")
                if routing_config and provider_type == "openrouter":
                    routing_json = json.dumps(
                        routing_config,
                        ensure_ascii=True,
                        sort_keys=True,
                    )
            connection.execute(
                """
                UPDATE provider_models
                SET is_allowed = ?,
                    routing_config_json = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE provider_id = ? AND model_id = ?
                """,
                (
                    int(preference.is_allowed),
                    routing_json,
                    provider_id,
                    preference.model_id,
                ),
            )

        connection.execute(
            """
            UPDATE model_providers
            SET default_model_id = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (payload.default_model_id, provider_id),
        )
        connection.commit()

    return get_provider_with_models(provider_id)


def get_provider_with_models(provider_id: str) -> ProviderWithModels | None:
    stored = get_provider(provider_id)
    if stored is None:
        return None
    return ProviderWithModels(
        **stored.provider.model_dump(),
        models=list_models(provider_id),
    )


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
    _require_allowed_default(selection.provider_id, selection.model_id)
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


def _require_allowed_default(provider_id: str, model_id: str) -> None:
    model = get_model(provider_id, model_id)
    if model is None:
        raise ValueError("Model does not belong to this provider")
    if not model.is_allowed:
        raise ValueError("Model is not allowed for this provider")
