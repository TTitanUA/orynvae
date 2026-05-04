from __future__ import annotations

import json
import sqlite3
from typing import Any

from app.models.settings import PrivacySettingsRecord
from app.storage.migrations import apply_migrations
from app.storage.paths import get_database_path

PRIVACY_SETTINGS_KEY = "privacy"


def _connection() -> sqlite3.Connection:
    apply_migrations()
    connection = sqlite3.connect(get_database_path())
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def get_privacy_settings() -> PrivacySettingsRecord:
    with _connection() as connection:
        row = connection.execute(
            "SELECT value_json FROM app_settings WHERE key = ?",
            (PRIVACY_SETTINGS_KEY,),
        ).fetchone()

    if row is None:
        return PrivacySettingsRecord()

    try:
        value: Any = json.loads(row["value_json"])
    except json.JSONDecodeError:
        return PrivacySettingsRecord()

    return PrivacySettingsRecord.model_validate(value if isinstance(value, dict) else {})


def update_privacy_settings(settings: PrivacySettingsRecord) -> PrivacySettingsRecord:
    value_json = settings.model_dump_json()
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO app_settings (key, value_json, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET
              value_json = excluded.value_json,
              updated_at = CURRENT_TIMESTAMP
            """,
            (PRIVACY_SETTINGS_KEY, value_json),
        )
        connection.commit()

    return settings
