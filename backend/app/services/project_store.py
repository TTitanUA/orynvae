from __future__ import annotations

import sqlite3
from uuid import uuid4

from app.models.projects import ProjectCreate, ProjectRecord, ProjectUpdate
from app.storage.migrations import apply_migrations
from app.storage.paths import get_database_path


def _connection() -> sqlite3.Connection:
    apply_migrations()
    connection = sqlite3.connect(get_database_path())
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _project_from_row(row: sqlite3.Row) -> ProjectRecord:
    return ProjectRecord(
        id=row["id"],
        title=row["title"],
        synopsis=row["synopsis"],
        status=row["status"],
        active_provider_id=row["active_provider_id"],
        active_model_id=row["active_model_id"],
        expansion_policy=row["expansion_policy"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        archived_at=row["archived_at"],
    )


def list_projects(*, include_archived: bool = False) -> list[ProjectRecord]:
    conditions: list[str] = []
    if not include_archived:
        conditions.append("archived_at IS NULL")
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    with _connection() as connection:
        rows = connection.execute(
            f"""
            SELECT
              id,
              title,
              synopsis,
              status,
              active_provider_id,
              active_model_id,
              expansion_policy,
              created_at,
              updated_at,
              archived_at
            FROM projects
            {where}
            ORDER BY updated_at DESC, title ASC
            """
        ).fetchall()
    return [_project_from_row(row) for row in rows]


def get_project(project_id: str) -> ProjectRecord | None:
    with _connection() as connection:
        row = connection.execute(
            """
            SELECT
              id,
              title,
              synopsis,
              status,
              active_provider_id,
              active_model_id,
              expansion_policy,
              created_at,
              updated_at,
              archived_at
            FROM projects
            WHERE id = ? AND archived_at IS NULL
            """,
            (project_id,),
        ).fetchone()
    return _project_from_row(row) if row else None


def create_project(payload: ProjectCreate) -> ProjectRecord:
    project_id = str(uuid4())
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO projects (
              id,
              title,
              synopsis,
              status,
              active_provider_id,
              active_model_id,
              expansion_policy
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                project_id,
                payload.title.strip(),
                payload.synopsis,
                payload.status,
                payload.active_provider_id,
                payload.active_model_id,
                payload.expansion_policy,
            ),
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

    values = payload.model_dump(exclude_unset=True)
    nullable_fields = {"synopsis", "active_provider_id", "active_model_id"}
    for key in list(values):
        if values[key] is None and key not in nullable_fields:
            values.pop(key)
    if "title" in values:
        values["title"] = _clean(values["title"])
    if "status" in values:
        values["status"] = _clean(values["status"])
    if "expansion_policy" in values:
        values["expansion_policy"] = _clean(values["expansion_policy"])
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
            SET archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP),
                status = 'archived',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND archived_at IS NULL
            """,
            (project_id,),
        )
        connection.commit()
    return cursor.rowcount > 0


def touch_project(project_id: str) -> None:
    with _connection() as connection:
        connection.execute(
            """
            UPDATE projects
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND archived_at IS NULL
            """,
            (project_id,),
        )
        connection.commit()
