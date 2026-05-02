from __future__ import annotations

import json
import sqlite3
from typing import Any
from uuid import uuid4

from app.models.projects import (
    ChapterPlanRecord,
    CharacterWorkspaceRecord,
    IdeaLabRecord,
    PlotArcWorkspaceRecord,
    PlotBoardRecord,
    ProjectCreate,
    ProjectRecord,
    ProjectSettingsRecord,
    ProjectSetupCreate,
    ProjectUpdate,
    ProjectWorkspaceRecord,
    ProjectWorkspaceUpdate,
    WorkspaceSettings,
    WorldBibleRecord,
    WorldEntryRecord,
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


def get_project_workspace(project_id: str) -> ProjectWorkspaceRecord | None:
    project = get_project(project_id)
    if project is None:
        return None

    with _connection() as connection:
        return ProjectWorkspaceRecord(
            project=project,
            settings=_workspace_settings(project.settings),
            idea_lab=_get_idea_lab(connection, project_id, project.settings),
            world_bible=_get_world_bible(connection, project_id),
            characters=_get_characters(connection, project_id),
            plot_board=_get_plot_board(connection, project_id),
        )


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


def update_project_workspace(
    project_id: str,
    payload: ProjectWorkspaceUpdate,
) -> ProjectWorkspaceRecord | None:
    current = get_project(project_id)
    if current is None:
        return None

    update_values = ProjectUpdate(
        name=payload.name if payload.name is not None else current.name,
        description=payload.description,
        synopsis=payload.synopsis,
        provider_id=payload.provider_id,
        model_id=payload.model_id,
        status=current.status,
    )

    with _connection() as connection:
        connection.execute(
            """
            UPDATE projects
            SET name = ?,
                description = ?,
                synopsis = ?,
                provider_id = ?,
                model_id = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (
                update_values.name,
                _clean(update_values.description),
                _clean(update_values.synopsis),
                update_values.provider_id,
                update_values.model_id,
                project_id,
            ),
        )
        _upsert_workspace_settings(connection, project_id, payload.settings)
        _replace_idea_lab(connection, project_id, payload.idea_lab)
        _replace_world_bible(connection, project_id, payload.world_bible)
        _replace_characters(connection, project_id, payload.characters)
        _replace_plot_board(connection, project_id, payload.plot_board)
        connection.commit()

    return get_project_workspace(project_id)


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


def _workspace_settings(settings: ProjectSettingsRecord | None) -> WorkspaceSettings:
    json_settings = settings.settings if settings else {}
    return WorkspaceSettings(
        genre=settings.genre if settings else None,
        tone=settings.tone if settings else None,
        setting=settings.setting if settings else None,
        format=settings.format if settings else None,
        central_conflict=_string_setting(json_settings, "central_conflict"),
        themes=_list_setting(json_settings, "themes"),
        target_length=_string_setting(json_settings, "target_length"),
        point_of_view=_string_setting(json_settings, "point_of_view"),
    )


def _get_idea_lab(
    connection: sqlite3.Connection,
    project_id: str,
    settings: ProjectSettingsRecord | None,
) -> IdeaLabRecord:
    idea_row = connection.execute(
        """
        SELECT *
        FROM ideas
        WHERE project_id = ?
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1
        """,
        (project_id,),
    ).fetchone()
    suggestions = _suggestions_by_type(connection, project_id)
    json_settings = settings.settings if settings else {}
    return IdeaLabRecord(
        source_text=idea_row["source_text"] if idea_row else None,
        expanded_synopsis=idea_row["expanded_synopsis"] if idea_row else None,
        selected_direction=idea_row["selected_direction"] if idea_row else None,
        directions=suggestions.get("project_direction", []),
        themes=_list_setting(json_settings, "themes") or suggestions.get("idea_theme", []),
        motives=suggestions.get("idea_motive", []),
        conflicts=suggestions.get("idea_conflict", []),
    )


def _suggestions_by_type(
    connection: sqlite3.Connection,
    project_id: str,
) -> dict[str, list[str]]:
    rows = connection.execute(
        """
        SELECT suggestion_type, content
        FROM generated_suggestions
        WHERE project_id = ? AND status != 'rejected'
        ORDER BY created_at ASC
        """,
        (project_id,),
    ).fetchall()
    grouped: dict[str, list[str]] = {}
    for row in rows:
        grouped.setdefault(row["suggestion_type"], []).append(row["content"])
    return grouped


def _get_world_bible(connection: sqlite3.Connection, project_id: str) -> WorldBibleRecord:
    rule_rows = connection.execute(
        """
        SELECT id, title, content, canon_status
        FROM world_entries
        WHERE project_id = ? AND type = 'rule'
        ORDER BY updated_at DESC, title ASC
        """,
        (project_id,),
    ).fetchall()
    location_rows = connection.execute(
        """
        SELECT id, name, description
        FROM locations
        WHERE project_id = ?
        ORDER BY updated_at DESC, name ASC
        """,
        (project_id,),
    ).fetchall()
    faction_rows = connection.execute(
        """
        SELECT id, name, description
        FROM factions
        WHERE project_id = ?
        ORDER BY updated_at DESC, name ASC
        """,
        (project_id,),
    ).fetchall()
    return WorldBibleRecord(
        rules=[
            WorldEntryRecord(
                id=row["id"],
                title=row["title"],
                content=row["content"],
                canon_status=row["canon_status"],
            )
            for row in rule_rows
        ],
        locations=[
            WorldEntryRecord(id=row["id"], title=row["name"], content=row["description"])
            for row in location_rows
        ],
        factions=[
            WorldEntryRecord(id=row["id"], title=row["name"], content=row["description"])
            for row in faction_rows
        ],
    )


def _get_characters(
    connection: sqlite3.Connection,
    project_id: str,
) -> list[CharacterWorkspaceRecord]:
    rows = connection.execute(
        """
        SELECT *
        FROM characters
        WHERE project_id = ?
        ORDER BY updated_at DESC, name ASC
        """,
        (project_id,),
    ).fetchall()
    return [
        CharacterWorkspaceRecord(
            id=row["id"],
            name=row["name"],
            role=row["role"],
            biography=row["biography"],
            motivation=row["motivation"],
            goal=row["goal"],
            fear=row["fear"],
            internal_conflict=row["internal_conflict"],
        )
        for row in rows
    ]


def _get_plot_board(connection: sqlite3.Connection, project_id: str) -> PlotBoardRecord:
    arc_rows = connection.execute(
        """
        SELECT *
        FROM plot_arcs
        WHERE project_id = ?
        ORDER BY position ASC, updated_at DESC
        """,
        (project_id,),
    ).fetchall()
    chapter_rows = connection.execute(
        """
        SELECT id, title, summary, status, position
        FROM chapters
        WHERE project_id = ?
        ORDER BY position ASC, updated_at DESC
        """,
        (project_id,),
    ).fetchall()
    return PlotBoardRecord(
        arcs=[
            PlotArcWorkspaceRecord(
                id=row["id"],
                title=row["title"],
                description=row["description"],
                arc_type=row["arc_type"],
                position=row["position"],
            )
            for row in arc_rows
        ],
        chapters=[
            ChapterPlanRecord(
                id=row["id"],
                title=row["title"],
                summary=row["summary"],
                status=row["status"],
                position=row["position"],
            )
            for row in chapter_rows
        ],
    )


def _upsert_workspace_settings(
    connection: sqlite3.Connection,
    project_id: str,
    settings: WorkspaceSettings,
) -> None:
    settings_json = {
        "central_conflict": _clean(settings.central_conflict),
        "themes": _clean_list(settings.themes),
        "target_length": _clean(settings.target_length),
        "point_of_view": _clean(settings.point_of_view),
    }
    existing = _get_settings(connection, project_id)
    if existing is None:
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
                _clean(settings.genre),
                _clean(settings.tone),
                _clean(settings.setting),
                _clean(settings.format),
                json.dumps(settings_json, ensure_ascii=False),
            ),
        )
        return

    connection.execute(
        """
        UPDATE project_settings
        SET genre = ?,
            tone = ?,
            setting = ?,
            format = ?,
            settings_json = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE project_id = ?
        """,
        (
            _clean(settings.genre),
            _clean(settings.tone),
            _clean(settings.setting),
            _clean(settings.format),
            json.dumps(settings_json, ensure_ascii=False),
            project_id,
        ),
    )


def _replace_idea_lab(
    connection: sqlite3.Connection,
    project_id: str,
    idea_lab: IdeaLabRecord,
) -> None:
    connection.execute("DELETE FROM ideas WHERE project_id = ?", (project_id,))
    if any([idea_lab.source_text, idea_lab.expanded_synopsis, idea_lab.selected_direction]):
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
                _clean(idea_lab.source_text) or "Workspace idea",
                _clean(idea_lab.expanded_synopsis),
                _clean(idea_lab.selected_direction),
            ),
        )

    _replace_suggestions(connection, project_id, "project_direction", idea_lab.directions)
    _replace_suggestions(connection, project_id, "idea_theme", idea_lab.themes)
    _replace_suggestions(connection, project_id, "idea_motive", idea_lab.motives)
    _replace_suggestions(connection, project_id, "idea_conflict", idea_lab.conflicts)


def _replace_suggestions(
    connection: sqlite3.Connection,
    project_id: str,
    suggestion_type: str,
    values: list[str],
) -> None:
    connection.execute(
        "DELETE FROM generated_suggestions WHERE project_id = ? AND suggestion_type = ?",
        (project_id, suggestion_type),
    )
    for value in _clean_list(values):
        connection.execute(
            """
            INSERT INTO generated_suggestions (
              id, project_id, suggestion_type, title, content, status
            )
            VALUES (?, ?, ?, ?, ?, 'accepted')
            """,
            (str(uuid4()), project_id, suggestion_type, _preview(value), value),
        )


def _replace_world_bible(
    connection: sqlite3.Connection,
    project_id: str,
    world_bible: WorldBibleRecord,
) -> None:
    connection.execute(
        "DELETE FROM world_entries WHERE project_id = ? AND type = 'rule'",
        (project_id,),
    )
    for item in world_bible.rules:
        connection.execute(
            """
            INSERT INTO world_entries (
              id, project_id, type, title, content, canon_status
            )
            VALUES (?, ?, 'rule', ?, ?, ?)
            """,
            (
                str(uuid4()),
                project_id,
                item.title.strip(),
                _clean(item.content) or "",
                _clean(item.canon_status) or "draft",
            ),
        )

    connection.execute("DELETE FROM locations WHERE project_id = ?", (project_id,))
    for item in world_bible.locations:
        connection.execute(
            """
            INSERT INTO locations (id, project_id, name, description)
            VALUES (?, ?, ?, ?)
            """,
            (str(uuid4()), project_id, item.title.strip(), _clean(item.content)),
        )

    connection.execute("DELETE FROM factions WHERE project_id = ?", (project_id,))
    for item in world_bible.factions:
        connection.execute(
            """
            INSERT INTO factions (id, project_id, name, description)
            VALUES (?, ?, ?, ?)
            """,
            (str(uuid4()), project_id, item.title.strip(), _clean(item.content)),
        )


def _replace_characters(
    connection: sqlite3.Connection,
    project_id: str,
    characters: list[CharacterWorkspaceRecord],
) -> None:
    connection.execute("DELETE FROM characters WHERE project_id = ?", (project_id,))
    for character in characters:
        connection.execute(
            """
            INSERT INTO characters (
              id, project_id, name, role, biography, motivation, goal, fear, internal_conflict
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid4()),
                project_id,
                character.name.strip(),
                _clean(character.role),
                _clean(character.biography),
                _clean(character.motivation),
                _clean(character.goal),
                _clean(character.fear),
                _clean(character.internal_conflict),
            ),
        )


def _replace_plot_board(
    connection: sqlite3.Connection,
    project_id: str,
    plot_board: PlotBoardRecord,
) -> None:
    connection.execute("DELETE FROM plot_arcs WHERE project_id = ?", (project_id,))
    for index, arc in enumerate(plot_board.arcs):
        connection.execute(
            """
            INSERT INTO plot_arcs (
              id, project_id, title, description, arc_type, position
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid4()),
                project_id,
                arc.title.strip(),
                _clean(arc.description),
                _clean(arc.arc_type) or "main",
                arc.position if arc.position >= 0 else index,
            ),
        )

    connection.execute("DELETE FROM chapters WHERE project_id = ?", (project_id,))
    for index, chapter in enumerate(plot_board.chapters):
        connection.execute(
            """
            INSERT INTO chapters (id, project_id, title, summary, status, position)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid4()),
                project_id,
                chapter.title.strip(),
                _clean(chapter.summary),
                _clean(chapter.status) or "draft",
                chapter.position if chapter.position >= 0 else index,
            ),
        )


def _string_setting(settings: dict[str, Any], key: str) -> str | None:
    value = settings.get(key)
    return value if isinstance(value, str) else None


def _list_setting(settings: dict[str, Any], key: str) -> list[str]:
    value = settings.get(key)
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str) and item.strip()]


def _clean_list(values: list[str]) -> list[str]:
    return [item.strip() for item in values if item.strip()]


def _preview(text: str) -> str:
    clean = " ".join(text.split())
    return clean[:77] + "..." if len(clean) > 80 else clean
