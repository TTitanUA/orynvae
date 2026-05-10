from __future__ import annotations

from app.models.ai_actions import AiActionContext, PrepareChapterSessionOutput
from app.models.chapters import (
    ChapterCreateRequest,
    ChapterPrepareRequest,
    ChapterPrepareResponse,
    ChapterUpdateRequest,
)
from app.models.projects import ProjectRecord
from app.models.story_runtime import (
    ChapterCreate,
    ChapterRecord,
    ChapterSessionCreate,
    ChapterUpdate,
    SessionTurnCreate,
)
from app.services import project_ai_settings, project_store, story_runtime_store


class ChapterPreparationError(Exception):
    pass


def create_chapter(project_id: str, payload: ChapterCreateRequest) -> ChapterRecord:
    chapters = story_runtime_store.list_chapters(project_id)
    next_order = max((chapter.order_index for chapter in chapters), default=0) + 1
    order_index = payload.order_index if payload.order_index is not None else next_order
    title = _clean_optional(payload.title) or f"Глава {order_index}"
    chapter = story_runtime_store.create_chapter(
        project_id,
        ChapterCreate(
            title=title,
            order_index=order_index,
            status="planned",
            synopsis=_clean_optional(payload.synopsis),
        ),
    )
    project_store.touch_project(project_id)
    return chapter


def update_chapter(
    project_id: str,
    chapter_id: str,
    payload: ChapterUpdateRequest,
) -> ChapterRecord | None:
    update = ChapterUpdate(
        title=_clean_optional(payload.title),
        order_index=payload.order_index,
        status=payload.status,
        synopsis=_clean_optional(payload.synopsis),
    )
    chapter = story_runtime_store.update_chapter(project_id, chapter_id, update)
    if chapter is not None:
        project_store.touch_project(project_id)
    return chapter


async def prepare_chapter_session(
    project: ProjectRecord,
    chapter_id: str,
    payload: ChapterPrepareRequest,
) -> ChapterPrepareResponse | None:
    chapter = story_runtime_store.get_chapter(project.id, chapter_id)
    if chapter is None:
        return None

    active_story_line_ids = _active_line_ids(payload)
    _validate_story_line_ids(project.id, [*active_story_line_ids, *payload.ignored_story_line_ids])
    controlled_characters = _validate_controlled_character_ids(
        project.id,
        payload.controlled_character_ids,
    )

    chapter = _update_prepared_chapter(project.id, chapter, payload)
    memory_items = [
        item
        for item in story_runtime_store.list_memory_items(project.id)
        if item.status != "rejected"
    ]
    story_lines = [
        line
        for line in story_runtime_store.list_story_lines(project.id)
        if line.status != "rejected"
    ]
    selected_story_lines = [line for line in story_lines if line.id in active_story_line_ids]

    result = await project_ai_settings.execute_project_action(
        project_id=project.id,
        action_type="prepare_chapter_session",
        input={
            "focus": payload.focus,
            "user_role": payload.user_role,
            "controlled_character_ids": payload.controlled_character_ids,
            "primary_story_line_id": payload.primary_story_line_id,
            "secondary_story_line_ids": payload.secondary_story_line_ids,
            "ignored_story_line_ids": payload.ignored_story_line_ids,
            "tone": payload.tone,
            "pace": payload.pace,
            "expansion_policy_override": payload.expansion_policy_override,
            "start_point": payload.start_point,
            "language": "ru",
        },
        context=AiActionContext(
            synopsis=project.synopsis,
            project=project.model_dump(mode="json"),
            memory_items=[item.model_dump(mode="json") for item in memory_items],
            story_lines=[line.model_dump(mode="json") for line in story_lines],
            chapter=chapter.model_dump(mode="json"),
            extra={
                "selected_story_lines": [
                    line.model_dump(mode="json") for line in selected_story_lines
                ],
                "controlled_characters": [
                    item.model_dump(mode="json") for item in controlled_characters
                ],
                "instructions": [
                    "Prepare a flexible narrator session frame, not a fixed plot.",
                    "Do not resolve mysteries or decide the chapter ending.",
                    "Return concise opening material and meaningful first actions.",
                ],
            },
        ),
        privacy_level="project",
    )
    output = PrepareChapterSessionOutput.model_validate(result.structured_json)
    session = story_runtime_store.create_chapter_session(
        project.id,
        ChapterSessionCreate(
            chapter_id=chapter.id,
            status="preparing",
            user_role=payload.user_role,
            controlled_character_ids=payload.controlled_character_ids,
            active_story_line_ids=active_story_line_ids,
            tone=_clean_optional(payload.tone),
            pace=payload.pace,
            expansion_policy_override=_clean_optional(payload.expansion_policy_override),
        ),
    )
    opening_turn = story_runtime_store.create_session_turn(
        session.id,
        SessionTurnCreate(
            turn_index=1,
            actor_type="ai",
            turn_type="narration",
            content=output.narrator_opening,
            related_memory_item_ids=payload.controlled_character_ids,
            related_story_line_ids=active_story_line_ids,
        ),
    )
    updated_chapter = story_runtime_store.update_chapter(
        project.id,
        chapter.id,
        ChapterUpdate(session_id=session.id),
    )
    project_store.touch_project(project.id)
    return ChapterPrepareResponse(
        chapter=updated_chapter or chapter,
        session=session,
        opening_turn=opening_turn,
        narrator_opening=output.narrator_opening,
        suggested_actions=output.suggested_actions,
        relevant_memory_titles=output.relevant_memory_titles,
        warnings=output.warnings,
        chapter_intention=output.chapter_intention,
        start_situation=output.start_situation,
        participant_titles=output.participant_titles,
        possible_line_movements=output.possible_line_movements,
        coherence_risks=output.coherence_risks,
    )


def _update_prepared_chapter(
    project_id: str,
    chapter: ChapterRecord,
    payload: ChapterPrepareRequest,
) -> ChapterRecord:
    title = _clean_optional(payload.title)
    synopsis = _prepared_synopsis(payload)
    if title is None and synopsis is None:
        return chapter
    updated = story_runtime_store.update_chapter(
        project_id,
        chapter.id,
        ChapterUpdate(title=title, synopsis=synopsis),
    )
    return updated or chapter


def _active_line_ids(payload: ChapterPrepareRequest) -> list[str]:
    return [
        line_id
        for line_id in [payload.primary_story_line_id, *payload.secondary_story_line_ids]
        if line_id is not None
    ]


def _validate_story_line_ids(project_id: str, line_ids: list[str]) -> None:
    for line_id in set(line_ids):
        line = story_runtime_store.get_story_line(project_id, line_id)
        if line is None:
            raise ChapterPreparationError(f"Story line {line_id} was not found")
        if line.status == "rejected":
            raise ChapterPreparationError(f"Story line {line.title} is rejected")


def _validate_controlled_character_ids(project_id: str, item_ids: list[str]):
    characters = []
    for item_id in set(item_ids):
        item = story_runtime_store.get_memory_item(project_id, item_id)
        if item is None:
            raise ChapterPreparationError(f"Character {item_id} was not found")
        if item.type != "character":
            raise ChapterPreparationError(f"Memory item {item.title} is not a character")
        if item.status == "rejected":
            raise ChapterPreparationError(f"Character {item.title} is rejected")
        characters.append(item)
    return characters


def _prepared_synopsis(payload: ChapterPrepareRequest) -> str | None:
    parts: list[str] = []
    if payload.focus:
        parts.append(payload.focus.strip())
    if payload.start_point:
        parts.append(f"Стартовая ситуация: {payload.start_point.strip()}")
    return "\n\n".join(part for part in parts if part) or None


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None
