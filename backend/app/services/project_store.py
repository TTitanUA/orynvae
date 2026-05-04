from __future__ import annotations

import json
import sqlite3
from typing import Any
from uuid import uuid4

from app.models.projects import (
    CanonFactLinkRecord,
    CanonFactRecord,
    CanonWorkspaceRecord,
    ChapterEditorRecord,
    ChapterEditorRecordSet,
    ChapterEditorUpdate,
    ChapterPlanRecord,
    ContinuityCheckRecord,
    ContinuityIssueRecord,
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
    TimelineEventRecord,
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
        is_hidden=_bool(project_row["is_hidden"]),
        settings=_settings_from_row(settings_row),
    )


def _get_settings(connection: sqlite3.Connection, project_id: str) -> sqlite3.Row | None:
    return connection.execute(
        "SELECT * FROM project_settings WHERE project_id = ?",
        (project_id,),
    ).fetchone()


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


def get_project(project_id: str, *, include_hidden: bool = True) -> ProjectRecord | None:
    with _connection() as connection:
        hidden_clause = "" if include_hidden else " AND is_hidden = 0"
        row = connection.execute(
            f"SELECT * FROM projects WHERE id = ?{hidden_clause}",
            (project_id,),
        ).fetchone()
        if row is None:
            return None
        return _project_from_row(row, _get_settings(connection, project_id))


def get_project_workspace(project_id: str, *, include_hidden: bool = True) -> ProjectWorkspaceRecord | None:
    project = get_project(project_id, include_hidden=include_hidden)
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
            canon=_get_canon_workspace(connection, project_id),
        )


def get_chapter_editor(project_id: str, *, include_hidden: bool = True) -> ChapterEditorRecordSet | None:
    project = get_project(project_id, include_hidden=include_hidden)
    if project is None:
        return None

    with _connection() as connection:
        return ChapterEditorRecordSet(
            project=project,
            settings=_workspace_settings(project.settings),
            characters=_get_characters(connection, project_id),
            arcs=_get_plot_board(connection, project_id).arcs,
            chapters=_get_chapter_editor_chapters(connection, project_id),
            saved_at=project.updated_at,
        )


def update_chapter_editor(
    project_id: str,
    payload: ChapterEditorUpdate,
) -> ChapterEditorRecordSet | None:
    project = get_project(project_id)
    if project is None:
        return None

    with _connection() as connection:
        _replace_editor_chapters(connection, project_id, payload.chapters)
        connection.execute(
            "UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (project_id,),
        )
        connection.commit()

    return get_chapter_editor(project_id)


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
        if payload.is_hidden:
            connection.execute("UPDATE projects SET is_hidden = 1 WHERE id = ?", (project_id,))
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
        if payload.is_hidden:
            connection.execute("UPDATE projects SET is_hidden = 1 WHERE id = ?", (project_id,))
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
        is_hidden=payload.is_hidden if payload.is_hidden is not None else current.is_hidden,
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
                is_hidden = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (
                update_values.name,
                _clean(update_values.description),
                _clean(update_values.synopsis),
                update_values.provider_id,
                update_values.model_id,
                int(bool(update_values.is_hidden)),
                project_id,
            ),
        )
        _upsert_workspace_settings(connection, project_id, payload.settings)
        _replace_idea_lab(connection, project_id, payload.idea_lab)
        _replace_world_bible(connection, project_id, payload.world_bible)
        _replace_characters(connection, project_id, payload.characters)
        _replace_plot_board(connection, project_id, payload.plot_board)
        _replace_canon_workspace(connection, project_id, payload.canon)
        connection.commit()

    return get_project_workspace(project_id)


def store_continuity_check(
    project_id: str,
    source_text: str,
    issues: list[ContinuityIssueRecord],
    *,
    provider_id: str | None = None,
    model_id: str | None = None,
) -> ContinuityCheckRecord | None:
    if get_project(project_id) is None:
        return None

    check_id = str(uuid4())
    result_json = json.dumps([issue.model_dump(mode="json") for issue in issues], ensure_ascii=False)
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO continuity_checks (
              id, project_id, source_text, result_json, provider_id, model_id
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (check_id, project_id, source_text, result_json, provider_id, model_id),
        )
        connection.commit()
        row = connection.execute(
            "SELECT created_at FROM continuity_checks WHERE id = ?",
            (check_id,),
        ).fetchone()

    return ContinuityCheckRecord(
        id=check_id,
        project_id=project_id,
        issues=issues,
        created_at=row["created_at"] if row else "",
    )


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
            gender=row["gender"],
            age=row["age"],
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


def _get_canon_workspace(
    connection: sqlite3.Connection,
    project_id: str,
) -> CanonWorkspaceRecord:
    fact_rows = connection.execute(
        """
        SELECT id, title, fact, category, status, source_type, source_id, notes, created_at, updated_at
        FROM canon_facts
        WHERE project_id = ?
        ORDER BY updated_at DESC, created_at DESC
        """,
        (project_id,),
    ).fetchall()
    link_rows = connection.execute(
        """
        SELECT id, fact_id, target_type, target_id, label
        FROM canon_fact_links
        WHERE project_id = ?
        ORDER BY created_at ASC
        """,
        (project_id,),
    ).fetchall()
    links_by_fact: dict[str, list[CanonFactLinkRecord]] = {}
    for row in link_rows:
        links_by_fact.setdefault(row["fact_id"], []).append(
            CanonFactLinkRecord(
                id=row["id"],
                target_type=row["target_type"],
                target_id=row["target_id"],
                label=row["label"],
            )
        )
    event_rows = connection.execute(
        """
        SELECT id, title, summary, event_time, source_chapter_id, position, created_at, updated_at
        FROM timeline_events
        WHERE project_id = ?
        ORDER BY position ASC, updated_at DESC
        """,
        (project_id,),
    ).fetchall()
    return CanonWorkspaceRecord(
        facts=[
            CanonFactRecord(
                id=row["id"],
                title=row["title"] or _preview(row["fact"]),
                fact=row["fact"],
                category=row["category"],
                status=row["status"],
                source_type=row["source_type"],
                source_id=row["source_id"],
                notes=row["notes"],
                links=links_by_fact.get(row["id"], []),
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )
            for row in fact_rows
        ],
        timeline=[
            TimelineEventRecord(
                id=row["id"],
                title=row["title"],
                summary=row["summary"],
                event_time=row["event_time"],
                source_chapter_id=row["source_chapter_id"],
                position=row["position"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )
            for row in event_rows
        ],
    )


def _get_chapter_editor_chapters(
    connection: sqlite3.Connection,
    project_id: str,
) -> list[ChapterEditorRecord]:
    chapter_rows = connection.execute(
        """
        SELECT id, title, summary, body, status, position, created_at, updated_at
        FROM chapters
        WHERE project_id = ?
        ORDER BY position ASC, updated_at DESC
        """,
        (project_id,),
    ).fetchall()
    scene_rows = connection.execute(
        """
        SELECT id, chapter_id, title, summary, body, position, created_at, updated_at
        FROM scenes
        WHERE project_id = ?
        ORDER BY chapter_id ASC, position ASC, updated_at DESC
        """,
        (project_id,),
    ).fetchall()
    scenes_by_chapter: dict[str, list[dict[str, object]]] = {}
    for row in scene_rows:
        scenes_by_chapter.setdefault(row["chapter_id"], []).append(
            {
                "id": row["id"],
                "chapter_id": row["chapter_id"],
                "title": row["title"],
                "summary": row["summary"],
                "body": row["body"],
                "position": row["position"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            }
        )

    return [
        ChapterEditorRecord(
            id=row["id"],
            title=row["title"],
            summary=row["summary"],
            body=row["body"],
            status=row["status"],
            position=row["position"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            scenes=scenes_by_chapter.get(row["id"], []),
        )
        for row in chapter_rows
    ]


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
    existing_rows = connection.execute(
        "SELECT * FROM characters WHERE project_id = ?",
        (project_id,),
    ).fetchall()
    existing_by_id = {row["id"]: row for row in existing_rows}
    incoming_ids: list[str] = []

    for character in characters:
        character_id = character.id or str(uuid4())
        existing = existing_by_id.get(character_id)
        incoming_ids.append(character_id)
        gender = (
            _clean(character.gender)
            if "gender" in character.model_fields_set
            else (existing["gender"] if existing else None)
        )
        age = (
            _clean(character.age)
            if "age" in character.model_fields_set
            else (existing["age"] if existing else None)
        )
        if existing:
            connection.execute(
                """
                UPDATE characters
                SET name = ?,
                    gender = ?,
                    age = ?,
                    role = ?,
                    biography = ?,
                    motivation = ?,
                    goal = ?,
                    fear = ?,
                    internal_conflict = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE project_id = ? AND id = ?
                """,
                (
                    character.name.strip(),
                    gender,
                    age,
                    _clean(character.role),
                    _clean(character.biography),
                    _clean(character.motivation),
                    _clean(character.goal),
                    _clean(character.fear),
                    _clean(character.internal_conflict),
                    project_id,
                    character_id,
                ),
            )
            continue

        connection.execute(
            """
            INSERT INTO characters (
              id, project_id, name, gender, age, role, biography, motivation,
              goal, fear, internal_conflict
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                character_id,
                project_id,
                character.name.strip(),
                gender,
                age,
                _clean(character.role),
                _clean(character.biography),
                _clean(character.motivation),
                _clean(character.goal),
                _clean(character.fear),
                _clean(character.internal_conflict),
            ),
        )
    if incoming_ids:
        placeholders = ", ".join("?" for _ in incoming_ids)
        connection.execute(
            f"""
            DELETE FROM characters
            WHERE project_id = ? AND id NOT IN ({placeholders})
            """,
            [project_id, *incoming_ids],
        )
    else:
        connection.execute("DELETE FROM characters WHERE project_id = ?", (project_id,))


def _snapshot_chapter_drafts(
    connection: sqlite3.Connection,
    project_id: str,
) -> tuple[dict[str, str], dict[str, list[sqlite3.Row]]]:
    chapter_rows = connection.execute(
        "SELECT id, body FROM chapters WHERE project_id = ?",
        (project_id,),
    ).fetchall()
    scene_rows = connection.execute(
        """
        SELECT id, chapter_id, title, summary, body, position
        FROM scenes
        WHERE project_id = ?
        ORDER BY position ASC, updated_at DESC
        """,
        (project_id,),
    ).fetchall()
    scenes_by_chapter: dict[str, list[sqlite3.Row]] = {}
    for row in scene_rows:
        scenes_by_chapter.setdefault(row["chapter_id"], []).append(row)
    return ({row["id"]: row["body"] for row in chapter_rows}, scenes_by_chapter)


def _replace_editor_chapters(
    connection: sqlite3.Connection,
    project_id: str,
    chapters: list[ChapterEditorRecord],
) -> None:
    connection.execute("DELETE FROM chapters WHERE project_id = ?", (project_id,))
    for index, chapter in enumerate(chapters):
        chapter_id = chapter.id or str(uuid4())
        connection.execute(
            """
            INSERT INTO chapters (id, project_id, title, summary, body, status, position)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                chapter_id,
                project_id,
                chapter.title.strip(),
                _clean(chapter.summary),
                chapter.body,
                _clean(chapter.status) or "draft",
                chapter.position if chapter.position >= 0 else index,
            ),
        )
        for scene_index, scene in enumerate(chapter.scenes):
            connection.execute(
                """
                INSERT INTO scenes (
                  id, project_id, chapter_id, title, summary, body, position
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    scene.id or str(uuid4()),
                    project_id,
                    chapter_id,
                    _clean(scene.title),
                    _clean(scene.summary),
                    scene.body,
                    scene.position if scene.position >= 0 else scene_index,
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

    chapter_bodies, scenes_by_chapter = _snapshot_chapter_drafts(connection, project_id)
    connection.execute("DELETE FROM chapters WHERE project_id = ?", (project_id,))
    for index, chapter in enumerate(plot_board.chapters):
        chapter_id = chapter.id or str(uuid4())
        connection.execute(
            """
            INSERT INTO chapters (id, project_id, title, summary, body, status, position)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                chapter_id,
                project_id,
                chapter.title.strip(),
                _clean(chapter.summary),
                chapter_bodies.get(chapter_id, ""),
                _clean(chapter.status) or "draft",
                chapter.position if chapter.position >= 0 else index,
            ),
        )
        for scene in scenes_by_chapter.get(chapter_id, []):
            connection.execute(
                """
                INSERT INTO scenes (
                  id, project_id, chapter_id, title, summary, body, position
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    scene["id"],
                    project_id,
                    chapter_id,
                    scene["title"],
                    scene["summary"],
                    scene["body"],
                    scene["position"],
                ),
            )


def _replace_canon_workspace(
    connection: sqlite3.Connection,
    project_id: str,
    canon: CanonWorkspaceRecord,
) -> None:
    connection.execute("DELETE FROM canon_facts WHERE project_id = ?", (project_id,))
    for fact in canon.facts:
        fact_id = fact.id or str(uuid4())
        connection.execute(
            """
            INSERT INTO canon_facts (
              id, project_id, title, fact, category, status, source_type, source_id, notes
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                fact_id,
                project_id,
                fact.title.strip(),
                fact.fact.strip(),
                _clean(fact.category) or "general",
                _clean(fact.status) or "confirmed",
                _clean(fact.source_type),
                _clean(fact.source_id),
                _clean(fact.notes),
            ),
        )
        for link in fact.links:
            connection.execute(
                """
                INSERT INTO canon_fact_links (
                  id, project_id, fact_id, target_type, target_id, label
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    link.id or str(uuid4()),
                    project_id,
                    fact_id,
                    link.target_type,
                    link.target_id.strip(),
                    _clean(link.label),
                ),
            )

    connection.execute("DELETE FROM timeline_events WHERE project_id = ?", (project_id,))
    for index, event in enumerate(canon.timeline):
        connection.execute(
            """
            INSERT INTO timeline_events (
              id, project_id, title, summary, event_time, source_chapter_id, position
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event.id or str(uuid4()),
                project_id,
                event.title.strip(),
                _clean(event.summary),
                _clean(event.event_time),
                event.source_chapter_id,
                event.position if event.position >= 0 else index,
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
