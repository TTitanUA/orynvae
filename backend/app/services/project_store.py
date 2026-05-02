from __future__ import annotations

import json
import sqlite3
from typing import Any
from uuid import uuid4

from app.models.projects import (
    ProjectCreate,
    ProjectRecord,
    ProjectSettingsRecord,
    ProjectSetupCreate,
    ProjectUpdate,
)
from app.storage.migrations import apply_migrations
from app.storage.paths import get_database_path


def _connection() -> sqlite3.Connection:
    apply_migrations()
    connection = sqlite3.connect(get_database_path())
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _bool(value: object) -> bool:
    return bool(int(value)) if isinstance(value, int) else bool(value)


def _settings_from_row(row: sqlite3.Row | None) -> ProjectSettingsRecord | None:
    if row is None:
        return None
    settings: dict[str, Any] = {}
    if row["settings_json"]:
        settings = json.loads(row["settings_json"])
    return ProjectSettingsRecord(
        genre=row["genre"],
        tone=row["tone"],
        setting=row["setting"],
        format=row["format"],
        live_mode_recommended=_bool(row["live_mode_recommended"]),
        settings=settings,
    )


def _project_from_row(
    project_row: sqlite3.Row,
    settings_row: sqlite3.Row | None = None,
) -> ProjectRecord:
    return ProjectRecord(
        id=project_row["id"],
        name=project_row["name"],
        description=project_row["description"],
        synopsis=project_row["synopsis"],
        provider_id=project_row["provider_id"],
        model_id=project_row["model_id"],
        status=project_row["status"],
        created_at=project_row["created_at"],
        updated_at=project_row["updated_at"],
        archived_at=project_row["archived_at"],
        settings=_settings_from_row(settings_row),
    )


def _get_settings(connection: sqlite3.Connection, project_id: str) -> sqlite3.Row | None:
    return connection.execute(
        "SELECT * FROM project_settings WHERE project_id = ?",
        (project_id,),
    ).fetchone()


def list_projects(*, include_archived: bool = False) -> list[ProjectRecord]:
    where = "" if include_archived else "WHERE archived_at IS NULL"
    with _connection() as connection:
        rows = connection.execute(
            f"""
            SELECT *
            FROM projects
            {where}
            ORDER BY updated_at DESC, name ASC
            """
        ).fetchall()
        return [
            _project_from_row(row, _get_settings(connection, row["id"]))
            for row in rows
        ]


def get_project(project_id: str) -> ProjectRecord | None:
    with _connection() as connection:
        row = connection.execute(
            "SELECT * FROM projects WHERE id = ?",
            (project_id,),
        ).fetchone()
        if row is None:
            return None
        return _project_from_row(row, _get_settings(connection, project_id))


def create_project(payload: ProjectCreate) -> ProjectRecord:
    project_id = str(uuid4())
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO projects (id, name, description, synopsis, provider_id, model_id)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                project_id,
                payload.name.strip(),
                _clean(payload.description),
                _clean(payload.synopsis),
                payload.provider_id,
                payload.model_id,
            ),
        )
        connection.commit()

    project = get_project(project_id)
    if project is None:
        raise RuntimeError("Created project could not be loaded")
    return project


def create_project_from_setup(payload: ProjectSetupCreate) -> ProjectRecord:
    project_id = str(uuid4())
    settings = {
        "central_conflict": _clean(payload.central_conflict),
        "themes": [theme.strip() for theme in payload.themes if theme.strip()],
        "directions": [direction.strip() for direction in payload.directions if direction.strip()],
        "target_length": _clean(payload.target_length),
        "point_of_view": _clean(payload.point_of_view),
    }
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO projects (id, name, description, synopsis, provider_id, model_id)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                project_id,
                payload.name.strip(),
                _clean(payload.description),
                _clean(payload.synopsis),
                payload.provider_id,
                payload.model_id,
            ),
        )
        connection.execute(
            """
            INSERT INTO project_settings (
              id, project_id, genre, tone, setting, format, settings_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid4()),
                project_id,
                _clean(payload.genre),
                _clean(payload.tone),
                _clean(payload.setting),
                _clean(payload.format),
                json.dumps(settings, ensure_ascii=False),
            ),
        )
        connection.execute(
            """
            INSERT INTO ideas (
              id, project_id, source_text, expanded_synopsis, selected_direction
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                str(uuid4()),
                project_id,
                payload.idea_text.strip(),
                _clean(payload.synopsis),
                _clean(payload.selected_direction),
            ),
        )
        for direction in settings["directions"]:
            connection.execute(
                """
                INSERT INTO generated_suggestions (
                  id, project_id, suggestion_type, title, content, status
                )
                VALUES (?, ?, 'project_direction', ?, ?, 'accepted')
                """,
                (str(uuid4()), project_id, _preview(direction), direction),
            )
        connection.commit()

    project = get_project(project_id)
    if project is None:
        raise RuntimeError("Created project could not be loaded")
    return project


def update_project(project_id: str, payload: ProjectUpdate) -> ProjectRecord | None:
    current = get_project(project_id)
    if current is None:
        return None

    values = {
        key: _clean(value) if isinstance(value, str) else value
        for key, value in payload.model_dump(exclude_unset=True).items()
    }
    if not values:
        return current

    assignments = [f"{key} = ?" for key in values]
    parameters = list(values.values())
    assignments.append("updated_at = CURRENT_TIMESTAMP")
    parameters.append(project_id)

    with _connection() as connection:
        connection.execute(
            f"UPDATE projects SET {', '.join(assignments)} WHERE id = ?",
            parameters,
        )
        connection.commit()
    return get_project(project_id)


def archive_project(project_id: str) -> bool:
    with _connection() as connection:
        cursor = connection.execute(
            """
            UPDATE projects
            SET status = 'archived',
                archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND archived_at IS NULL
            """,
            (project_id,),
        )
        connection.commit()
    return cursor.rowcount > 0


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _preview(text: str) -> str:
    clean = " ".join(text.split())
    return clean[:77] + "..." if len(clean) > 80 else clean

