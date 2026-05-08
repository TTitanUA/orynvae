from __future__ import annotations

import json
import sqlite3
from uuid import uuid4

from app.models.story_runtime import (
    ChapterCreate,
    ChapterRecord,
    ChapterSessionCreate,
    ChapterSessionRecord,
    DraftVersionCreate,
    DraftVersionRecord,
    ForecastCreate,
    ForecastOptionCreate,
    ForecastOptionRecord,
    ForecastRecord,
    KeyEventCreate,
    KeyEventRecord,
    MemoryItemCreate,
    MemoryItemRecord,
    MemoryItemStatus,
    MemoryItemUpdate,
    MemoryProposalCreate,
    MemoryProposalRecord,
    MemoryProposalStatus,
    SessionTurnCreate,
    SessionTurnRecord,
    StoryLineCreate,
    StoryLineProgressCreate,
    StoryLineProgressRecord,
    StoryLineRecord,
)
from app.storage.migrations import apply_migrations
from app.storage.paths import get_database_path


def _connection() -> sqlite3.Connection:
    apply_migrations()
    connection = sqlite3.connect(get_database_path())
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _json(value: object) -> str:
    return json.dumps(value, ensure_ascii=True, sort_keys=True)


def _json_list(value: str | None) -> list[str]:
    if not value:
        return []
    parsed = json.loads(value)
    return [item for item in parsed if isinstance(item, str)] if isinstance(parsed, list) else []


def _json_dict(value: str | None) -> dict[str, object]:
    if not value:
        return {}
    parsed = json.loads(value)
    return parsed if isinstance(parsed, dict) else {}


def _bool(value: object) -> bool:
    return bool(int(value)) if isinstance(value, int) else bool(value)


def create_memory_item(project_id: str, payload: MemoryItemCreate) -> MemoryItemRecord:
    item_id = str(uuid4())
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO memory_items (
              id, project_id, type, title, summary, body, status, source_type, source_id, importance
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                item_id,
                project_id,
                payload.type,
                payload.title.strip(),
                payload.summary,
                payload.body,
                payload.status,
                payload.source_type,
                payload.source_id,
                payload.importance,
            ),
        )
        connection.commit()
    record = get_memory_item(project_id, item_id)
    if record is None:
        raise RuntimeError("Created memory item could not be loaded")
    return record


def list_memory_items(
    project_id: str,
    *,
    type: str | None = None,
    status: str | None = None,
    search: str | None = None,
    requires_confirmation: bool | None = None,
) -> list[MemoryItemRecord]:
    conditions = ["project_id = ?"]
    parameters: list[object] = [project_id]
    if type:
        conditions.append("type = ?")
        parameters.append(type)
    if status:
        conditions.append("status = ?")
        parameters.append(status)
    if requires_confirmation is True:
        conditions.append("status = 'proposed'")
    elif requires_confirmation is False:
        conditions.append("status != 'proposed'")
    if search:
        conditions.append(
            """
            (
              title LIKE ?
              OR COALESCE(summary, '') LIKE ?
              OR COALESCE(body, '') LIKE ?
              OR lower(title) LIKE ?
              OR lower(COALESCE(summary, '')) LIKE ?
              OR lower(COALESCE(body, '')) LIKE ?
            )
            """
        )
        raw_needle = f"%{search}%"
        needle = f"%{search.lower()}%"
        parameters.extend([raw_needle, raw_needle, raw_needle, needle, needle, needle])

    with _connection() as connection:
        rows = connection.execute(
            f"""
            SELECT *
            FROM memory_items
            WHERE {' AND '.join(conditions)}
            ORDER BY updated_at DESC, title ASC
            """,
            parameters,
        ).fetchall()
    return [_memory_item_from_row(row) for row in rows]


def get_memory_item(project_id: str, item_id: str) -> MemoryItemRecord | None:
    with _connection() as connection:
        row = connection.execute(
            """
            SELECT *
            FROM memory_items
            WHERE project_id = ? AND id = ?
            """,
            (project_id, item_id),
        ).fetchone()
    return _memory_item_from_row(row) if row else None


def update_memory_item(
    project_id: str,
    item_id: str,
    payload: MemoryItemUpdate,
) -> MemoryItemRecord | None:
    current = get_memory_item(project_id, item_id)
    if current is None:
        return None

    values = payload.model_dump(exclude_unset=True)
    nullable_fields = {"summary", "body", "source_type", "source_id"}
    for key in list(values):
        if values[key] is None and key not in nullable_fields:
            values.pop(key)
    if "title" in values and values["title"] is not None:
        values["title"] = values["title"].strip()
    if not values:
        return current

    assignments = [f"{key} = ?" for key in values]
    parameters = list(values.values())
    assignments.append("updated_at = CURRENT_TIMESTAMP")
    parameters.extend([project_id, item_id])

    with _connection() as connection:
        connection.execute(
            f"""
            UPDATE memory_items
            SET {', '.join(assignments)}
            WHERE project_id = ? AND id = ?
            """,
            parameters,
        )
        connection.commit()
    return get_memory_item(project_id, item_id)


def update_memory_item_status(
    project_id: str,
    item_id: str,
    status: MemoryItemStatus,
) -> MemoryItemRecord | None:
    return update_memory_item(project_id, item_id, MemoryItemUpdate(status=status))


def create_memory_proposal(
    project_id: str,
    payload: MemoryProposalCreate,
) -> MemoryProposalRecord:
    proposal_id = str(uuid4())
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO memory_proposals (
              id,
              project_id,
              proposal_type,
              target_item_id,
              suggested_payload,
              reason,
              source_type,
              source_id,
              status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                proposal_id,
                project_id,
                payload.proposal_type,
                payload.target_item_id,
                _json(payload.suggested_payload),
                payload.reason,
                payload.source_type,
                payload.source_id,
                payload.status,
            ),
        )
        connection.commit()
    rows = list_memory_proposals(project_id)
    return next(item for item in rows if item.id == proposal_id)


def list_memory_proposals(
    project_id: str,
    *,
    status: str | None = None,
) -> list[MemoryProposalRecord]:
    conditions = ["project_id = ?"]
    parameters: list[object] = [project_id]
    if status:
        conditions.append("status = ?")
        parameters.append(status)

    with _connection() as connection:
        rows = connection.execute(
            f"""
            SELECT *
            FROM memory_proposals
            WHERE {' AND '.join(conditions)}
            ORDER BY created_at DESC
            """,
            parameters,
        ).fetchall()
    return [_memory_proposal_from_row(row) for row in rows]


def get_memory_proposal(project_id: str, proposal_id: str) -> MemoryProposalRecord | None:
    with _connection() as connection:
        row = connection.execute(
            """
            SELECT *
            FROM memory_proposals
            WHERE project_id = ? AND id = ?
            """,
            (project_id, proposal_id),
        ).fetchone()
    return _memory_proposal_from_row(row) if row else None


def update_memory_proposal_status(
    project_id: str,
    proposal_id: str,
    status: MemoryProposalStatus,
) -> MemoryProposalRecord | None:
    with _connection() as connection:
        cursor = connection.execute(
            """
            UPDATE memory_proposals
            SET status = ?
            WHERE project_id = ? AND id = ?
            """,
            (status, project_id, proposal_id),
        )
        connection.commit()
    if cursor.rowcount == 0:
        return None
    return get_memory_proposal(project_id, proposal_id)


def create_story_line(project_id: str, payload: StoryLineCreate) -> StoryLineRecord:
    line_id = str(uuid4())
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO story_lines (
              id,
              project_id,
              type,
              title,
              description,
              current_state,
              status,
              priority,
              last_progress_chapter_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                line_id,
                project_id,
                payload.type,
                payload.title.strip(),
                payload.description,
                payload.current_state,
                payload.status,
                payload.priority,
                payload.last_progress_chapter_id,
            ),
        )
        connection.commit()
    record = get_story_line(project_id, line_id)
    if record is None:
        raise RuntimeError("Created story line could not be loaded")
    return record


def list_story_lines(project_id: str) -> list[StoryLineRecord]:
    with _connection() as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM story_lines
            WHERE project_id = ?
            ORDER BY priority DESC, updated_at DESC, title ASC
            """,
            (project_id,),
        ).fetchall()
    return [_story_line_from_row(row) for row in rows]


def get_story_line(project_id: str, line_id: str) -> StoryLineRecord | None:
    with _connection() as connection:
        row = connection.execute(
            """
            SELECT *
            FROM story_lines
            WHERE project_id = ? AND id = ?
            """,
            (project_id, line_id),
        ).fetchone()
    return _story_line_from_row(row) if row else None


def create_story_line_progress(
    project_id: str,
    payload: StoryLineProgressCreate,
) -> StoryLineProgressRecord:
    progress_id = str(uuid4())
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO story_line_progress (
              id,
              project_id,
              story_line_id,
              chapter_id,
              session_id,
              before_state,
              after_state,
              event_summary
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                progress_id,
                project_id,
                payload.story_line_id,
                payload.chapter_id,
                payload.session_id,
                payload.before_state,
                payload.after_state,
                payload.event_summary,
            ),
        )
        connection.commit()
    return next(item for item in list_story_line_progress(project_id, payload.story_line_id) if item.id == progress_id)


def list_story_line_progress(project_id: str, story_line_id: str) -> list[StoryLineProgressRecord]:
    with _connection() as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM story_line_progress
            WHERE project_id = ? AND story_line_id = ?
            ORDER BY created_at ASC
            """,
            (project_id, story_line_id),
        ).fetchall()
    return [_story_line_progress_from_row(row) for row in rows]


def create_chapter(project_id: str, payload: ChapterCreate) -> ChapterRecord:
    chapter_id = str(uuid4())
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO chapters (
              id,
              project_id,
              title,
              order_index,
              status,
              synopsis,
              draft_markdown,
              final_markdown,
              session_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                chapter_id,
                project_id,
                payload.title.strip(),
                payload.order_index,
                payload.status,
                payload.synopsis,
                payload.draft_markdown,
                payload.final_markdown,
                payload.session_id,
            ),
        )
        connection.commit()
    record = get_chapter(project_id, chapter_id)
    if record is None:
        raise RuntimeError("Created chapter could not be loaded")
    return record


def list_chapters(project_id: str) -> list[ChapterRecord]:
    with _connection() as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM chapters
            WHERE project_id = ?
            ORDER BY order_index ASC, created_at ASC
            """,
            (project_id,),
        ).fetchall()
    return [_chapter_from_row(row) for row in rows]


def get_chapter(project_id: str, chapter_id: str) -> ChapterRecord | None:
    with _connection() as connection:
        row = connection.execute(
            """
            SELECT *
            FROM chapters
            WHERE project_id = ? AND id = ?
            """,
            (project_id, chapter_id),
        ).fetchone()
    return _chapter_from_row(row) if row else None


def create_chapter_session(
    project_id: str,
    payload: ChapterSessionCreate,
) -> ChapterSessionRecord:
    session_id = str(uuid4())
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO chapter_sessions (
              id,
              project_id,
              chapter_id,
              status,
              user_role,
              controlled_character_ids,
              active_story_line_ids,
              tone,
              pace,
              expansion_policy_override,
              started_at,
              paused_at,
              completed_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                project_id,
                payload.chapter_id,
                payload.status,
                payload.user_role,
                _json(payload.controlled_character_ids),
                _json(payload.active_story_line_ids),
                payload.tone,
                payload.pace,
                payload.expansion_policy_override,
                payload.started_at,
                payload.paused_at,
                payload.completed_at,
            ),
        )
        connection.commit()
    return next(item for item in list_chapter_sessions(project_id) if item.id == session_id)


def list_chapter_sessions(project_id: str) -> list[ChapterSessionRecord]:
    with _connection() as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM chapter_sessions
            WHERE project_id = ?
            ORDER BY created_at DESC
            """,
            (project_id,),
        ).fetchall()
    return [_chapter_session_from_row(row) for row in rows]


def create_session_turn(session_id: str, payload: SessionTurnCreate) -> SessionTurnRecord:
    turn_id = str(uuid4())
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO session_turns (
              id,
              session_id,
              turn_index,
              actor_type,
              turn_type,
              content,
              related_memory_item_ids,
              related_story_line_ids,
              is_key_event,
              exclude_from_draft
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                turn_id,
                session_id,
                payload.turn_index,
                payload.actor_type,
                payload.turn_type,
                payload.content,
                _json(payload.related_memory_item_ids),
                _json(payload.related_story_line_ids),
                int(payload.is_key_event),
                int(payload.exclude_from_draft),
            ),
        )
        connection.commit()
    return next(item for item in list_session_turns(session_id) if item.id == turn_id)


def list_session_turns(session_id: str) -> list[SessionTurnRecord]:
    with _connection() as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM session_turns
            WHERE session_id = ?
            ORDER BY turn_index ASC
            """,
            (session_id,),
        ).fetchall()
    return [_session_turn_from_row(row) for row in rows]


def create_key_event(project_id: str, payload: KeyEventCreate) -> KeyEventRecord:
    event_id = str(uuid4())
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO key_events (
              id,
              project_id,
              session_id,
              chapter_id,
              title,
              summary,
              consequences,
              related_memory_item_ids,
              related_story_line_ids,
              include_in_draft
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                project_id,
                payload.session_id,
                payload.chapter_id,
                payload.title.strip(),
                payload.summary,
                payload.consequences,
                _json(payload.related_memory_item_ids),
                _json(payload.related_story_line_ids),
                int(payload.include_in_draft),
            ),
        )
        connection.commit()
    return next(item for item in list_key_events(payload.session_id) if item.id == event_id)


def list_key_events(session_id: str) -> list[KeyEventRecord]:
    with _connection() as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM key_events
            WHERE session_id = ?
            ORDER BY created_at ASC
            """,
            (session_id,),
        ).fetchall()
    return [_key_event_from_row(row) for row in rows]


def create_draft_version(project_id: str, payload: DraftVersionCreate) -> DraftVersionRecord:
    draft_id = str(uuid4())
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO draft_versions (
              id, project_id, chapter_id, source_session_id, mode, markdown, status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                draft_id,
                project_id,
                payload.chapter_id,
                payload.source_session_id,
                payload.mode,
                payload.markdown,
                payload.status,
            ),
        )
        connection.commit()
    return next(item for item in list_draft_versions(project_id, payload.chapter_id) if item.id == draft_id)


def list_draft_versions(project_id: str, chapter_id: str) -> list[DraftVersionRecord]:
    with _connection() as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM draft_versions
            WHERE project_id = ? AND chapter_id = ?
            ORDER BY created_at DESC
            """,
            (project_id, chapter_id),
        ).fetchall()
    return [_draft_version_from_row(row) for row in rows]


def create_forecast(project_id: str, payload: ForecastCreate) -> ForecastRecord:
    forecast_id = str(uuid4())
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO forecasts (id, project_id, source_chapter_id, summary, status)
            VALUES (?, ?, ?, ?, ?)
            """,
            (forecast_id, project_id, payload.source_chapter_id, payload.summary, payload.status),
        )
        for option in payload.options:
            _insert_forecast_option(connection, forecast_id, option)
        connection.commit()
    return next(item for item in list_forecasts(project_id) if item.id == forecast_id)


def list_forecasts(project_id: str) -> list[ForecastRecord]:
    with _connection() as connection:
        forecast_rows = connection.execute(
            """
            SELECT *
            FROM forecasts
            WHERE project_id = ?
            ORDER BY created_at DESC
            """,
            (project_id,),
        ).fetchall()
        option_rows = connection.execute(
            """
            SELECT forecast_options.*
            FROM forecast_options
            JOIN forecasts ON forecasts.id = forecast_options.forecast_id
            WHERE forecasts.project_id = ?
            ORDER BY forecast_options.rowid ASC
            """,
            (project_id,),
        ).fetchall()
    options_by_forecast: dict[str, list[ForecastOptionRecord]] = {}
    for row in option_rows:
        option = _forecast_option_from_row(row)
        options_by_forecast.setdefault(option.forecast_id, []).append(option)
    return [
        _forecast_from_row(row, options=options_by_forecast.get(row["id"], []))
        for row in forecast_rows
    ]


def _insert_forecast_option(
    connection: sqlite3.Connection,
    forecast_id: str,
    payload: ForecastOptionCreate,
) -> None:
    connection.execute(
        """
        INSERT INTO forecast_options (
          id,
          forecast_id,
          title,
          description,
          likely_consequences,
          related_story_line_ids,
          risks,
          is_selected_as_orientation
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(uuid4()),
            forecast_id,
            payload.title.strip(),
            payload.description,
            _json(payload.likely_consequences),
            _json(payload.related_story_line_ids),
            _json(payload.risks),
            int(payload.is_selected_as_orientation),
        ),
    )


def _memory_item_from_row(row: sqlite3.Row) -> MemoryItemRecord:
    return MemoryItemRecord(**dict(row))


def _memory_proposal_from_row(row: sqlite3.Row) -> MemoryProposalRecord:
    payload = dict(row)
    payload["suggested_payload"] = _json_dict(row["suggested_payload"])
    return MemoryProposalRecord(**payload)


def _story_line_from_row(row: sqlite3.Row) -> StoryLineRecord:
    return StoryLineRecord(**dict(row))


def _story_line_progress_from_row(row: sqlite3.Row) -> StoryLineProgressRecord:
    return StoryLineProgressRecord(**dict(row))


def _chapter_from_row(row: sqlite3.Row) -> ChapterRecord:
    return ChapterRecord(**dict(row))


def _chapter_session_from_row(row: sqlite3.Row) -> ChapterSessionRecord:
    payload = dict(row)
    payload["controlled_character_ids"] = _json_list(row["controlled_character_ids"])
    payload["active_story_line_ids"] = _json_list(row["active_story_line_ids"])
    return ChapterSessionRecord(**payload)


def _session_turn_from_row(row: sqlite3.Row) -> SessionTurnRecord:
    payload = dict(row)
    payload["related_memory_item_ids"] = _json_list(row["related_memory_item_ids"])
    payload["related_story_line_ids"] = _json_list(row["related_story_line_ids"])
    payload["is_key_event"] = _bool(row["is_key_event"])
    payload["exclude_from_draft"] = _bool(row["exclude_from_draft"])
    return SessionTurnRecord(**payload)


def _key_event_from_row(row: sqlite3.Row) -> KeyEventRecord:
    payload = dict(row)
    payload["related_memory_item_ids"] = _json_list(row["related_memory_item_ids"])
    payload["related_story_line_ids"] = _json_list(row["related_story_line_ids"])
    payload["include_in_draft"] = _bool(row["include_in_draft"])
    return KeyEventRecord(**payload)


def _draft_version_from_row(row: sqlite3.Row) -> DraftVersionRecord:
    return DraftVersionRecord(**dict(row))


def _forecast_option_from_row(row: sqlite3.Row) -> ForecastOptionRecord:
    payload = dict(row)
    payload["likely_consequences"] = _json_list(row["likely_consequences"])
    payload["related_story_line_ids"] = _json_list(row["related_story_line_ids"])
    payload["risks"] = _json_list(row["risks"])
    payload["is_selected_as_orientation"] = _bool(row["is_selected_as_orientation"])
    return ForecastOptionRecord(**payload)


def _forecast_from_row(
    row: sqlite3.Row,
    *,
    options: list[ForecastOptionRecord],
) -> ForecastRecord:
    payload = dict(row)
    payload["options"] = options
    return ForecastRecord(**payload)
