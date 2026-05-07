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


def _bool(value: object) -> bool:
    return bool(int(value)) if isinstance(value, int) else bool(value)


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _project_from_row(row: sqlite3.Row) -> ProjectRecord:
    return ProjectRecord(
        id=row["id"],
        name=row["name"],
        is_hidden=_bool(row["is_hidden"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        archived_at=row["archived_at"],
    )


def list_projects(*, include_archived: bool = False, include_hidden: bool = False) -> list[ProjectRecord]:
    conditions: list[str] = []
    if not include_archived:
        conditions.append("archived_at IS NULL")
    if not include_hidden:
        conditions.append("is_hidden = 0")
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    with _connection() as connection:
        rows = connection.execute(
            f"""
            SELECT id, name, is_hidden, created_at, updated_at, archived_at
            FROM projects
            {where}
            ORDER BY updated_at DESC, name ASC
            """
        ).fetchall()
    return [_project_from_row(row) for row in rows]


def get_project(project_id: str, *, include_hidden: bool = True) -> ProjectRecord | None:
    hidden_clause = "" if include_hidden else " AND is_hidden = 0"
    with _connection() as connection:
        row = connection.execute(
            f"""
            SELECT id, name, is_hidden, created_at, updated_at, archived_at
            FROM projects
            WHERE id = ? AND archived_at IS NULL{hidden_clause}
            """,
            (project_id,),
        ).fetchone()
    return _project_from_row(row) if row else None


def create_project(payload: ProjectCreate) -> ProjectRecord:
    project_id = str(uuid4())
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO projects (id, name, is_hidden)
            VALUES (?, ?, ?)
            """,
            (project_id, payload.name.strip(), int(payload.is_hidden)),
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
    if "name" in values:
        values["name"] = _clean(values["name"])
    if "is_hidden" in values:
        values["is_hidden"] = int(bool(values["is_hidden"]))
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
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND archived_at IS NULL
            """,
            (project_id,),
        )
        connection.commit()
    return cursor.rowcount > 0
