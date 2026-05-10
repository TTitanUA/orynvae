from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from http import HTTPStatus

from app.ai import service as ai_service
from app.models.ai_actions import (
    AiActionContext,
    AiSuggestedAction,
    NarrateTurnOutput,
    SuggestTurnActionsOutput,
)
from app.models.narrator_sessions import (
    NarratorAgentSettingsRequest,
    NarratorInputType,
    NarratorKeyEventUpdateRequest,
    NarratorRegenerateRequest,
    NarratorRollbackRequest,
    NarratorSuggestedActionsRegenerateRequest,
    NarratorSuggestedActionsResponse,
    NarratorSessionDetail,
    NarratorSessionLogResponse,
    NarratorTurnFlagUpdateRequest,
    NarratorTurnRequest,
    NarratorTurnResponse,
)
from app.models.projects import ProjectRecord
from app.models.story_runtime import (
    ChapterRecord,
    ChapterSessionRecord,
    ChapterSessionUpdate,
    ChapterUpdate,
    KeyEventCreate,
    KeyEventRecord,
    KeyEventUpdate,
    MemoryItemRecord,
    MemoryProposalCreate,
    MemoryProposalRecord,
    SessionSuggestedActionCreate,
    SessionSuggestedActionRecord,
    SessionSuggestedActionUpdate,
    SessionTurnCreate,
    SessionTurnRecord,
    StoryLineRecord,
)
from app.services import project_ai_settings, project_store, runtime_status, story_runtime_store


class NarratorSessionError(Exception):
    def __init__(
        self,
        message: str,
        *,
        status_code: int = HTTPStatus.UNPROCESSABLE_ENTITY,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True)
class NarratorContext:
    project: ProjectRecord
    chapter: ChapterRecord | None
    session: ChapterSessionRecord


def get_session_detail(session_id: str) -> NarratorSessionDetail | None:
    context = _load_context(session_id)
    if context is None:
        return None
    return _detail(context)


def get_session_log(session_id: str) -> NarratorSessionLogResponse | None:
    context = _load_context(session_id)
    if context is None:
        return None
    return _log_response(context)


def start_session(session_id: str) -> NarratorSessionDetail | None:
    context = _load_context(session_id)
    if context is None:
        return None
    runtime_status.require_creative_write(context.project.id)

    if context.session.status == "completed":
        raise NarratorSessionError("Completed sessions cannot be restarted", status_code=HTTPStatus.CONFLICT)
    if context.session.status in {"draft_ready", "reviewed"}:
        raise NarratorSessionError("Session is already past narrator mode", status_code=HTTPStatus.CONFLICT)

    started_at = context.session.started_at or _now()
    session = story_runtime_store.update_chapter_session(
        context.project.id,
        context.session.id,
        ChapterSessionUpdate(status="active", started_at=started_at, paused_at=None),
    )
    if context.chapter is not None:
        story_runtime_store.update_chapter(
            context.project.id,
            context.chapter.id,
            ChapterUpdate(status="in_session", session_id=context.session.id),
        )
    project_store.touch_project(context.project.id)
    return get_session_detail(session_id) or _detail(_replace_session(context, session or context.session))


def update_agent_settings(
    session_id: str,
    payload: NarratorAgentSettingsRequest,
) -> NarratorSessionDetail | None:
    context = _load_context(session_id)
    if context is None:
        return None
    runtime_status.require_creative_write(context.project.id)

    values = payload.model_dump(exclude_unset=True)
    if "agent_instructions" in values and values["agent_instructions"] is not None:
        stripped = str(values["agent_instructions"]).strip()
        values["agent_instructions"] = stripped or None
    session = story_runtime_store.update_chapter_session(
        context.project.id,
        context.session.id,
        ChapterSessionUpdate(**values),
    )
    project_store.touch_project(context.project.id)
    return get_session_detail(session_id) or _detail(_replace_session(context, session or context.session))


async def submit_turn(
    session_id: str,
    payload: NarratorTurnRequest,
) -> NarratorTurnResponse | None:
    context = _load_context(session_id)
    if context is None:
        return None
    runtime_status.require_creative_write(context.project.id)
    if context.session.status != "active":
        raise NarratorSessionError("Session must be active before submitting turns", status_code=HTTPStatus.CONFLICT)

    turns_before = story_runtime_store.list_session_turns(context.session.id)
    selected_action = _validate_selected_action(context.session.id, payload, turns_before)
    user_content = _turn_content(payload, selected_action)
    user_turn = story_runtime_store.create_session_turn(
        context.session.id,
        SessionTurnCreate(
            turn_index=story_runtime_store.next_session_turn_index(context.session.id),
            actor_type="user",
            turn_type="choice" if selected_action else payload.input_type,
            content=user_content,
            related_memory_item_ids=context.session.controlled_character_ids,
            related_story_line_ids=context.session.active_story_line_ids,
        ),
    )
    if selected_action is not None:
        story_runtime_store.update_session_suggested_action(
            context.session.id,
            selected_action.id,
            SessionSuggestedActionUpdate(status="selected", selected_turn_id=user_turn.id),
        )

    try:
        output = await _narrate(context, payload, user_turn, selected_action)
    except ai_service.AiActionException:
        _create_system_error_turn(context.session.id)
        project_store.touch_project(context.project.id)
        raise

    ai_turn, suggested_actions, key_events, memory_proposals = _persist_ai_turn_output(context, output)
    project_store.touch_project(context.project.id)
    session = story_runtime_store.get_chapter_session(context.project.id, context.session.id) or context.session

    return NarratorTurnResponse(
        session=session,
        user_turn=user_turn,
        ai_turn=ai_turn,
        suggested_actions=suggested_actions,
        key_event_candidates=key_events,
        memory_proposal_candidates=memory_proposals,
        story_line_update_candidates=output.story_line_update_candidates,
        warnings=output.warnings,
    )


async def regenerate_last_narration(
    session_id: str,
    payload: NarratorRegenerateRequest,
) -> NarratorSessionDetail | None:
    context = _load_context(session_id)
    if context is None:
        return None
    _require_active_replay_context(context)

    turns = story_runtime_store.list_session_turns(context.session.id)
    target_turn = next(
        (turn for turn in reversed(turns) if turn.actor_type == "ai" and turn.turn_type == "narration"),
        None,
    )
    if target_turn is None:
        raise NarratorSessionError("No narrator turn is available to regenerate", status_code=HTTPStatus.CONFLICT)
    await _regenerate_from_turn(context, turns, target_turn, payload.comment)
    project_store.touch_project(context.project.id)
    return get_session_detail(session_id)


async def regenerate_suggested_actions(
    session_id: str,
    payload: NarratorSuggestedActionsRegenerateRequest,
) -> NarratorSuggestedActionsResponse | None:
    context = _load_context(session_id)
    if context is None:
        return None
    _require_active_replay_context(context)

    turns = story_runtime_store.list_session_turns(context.session.id)
    latest_narration = next(
        (turn for turn in reversed(turns) if turn.actor_type == "ai" and turn.turn_type == "narration"),
        None,
    )
    if latest_narration is None:
        raise NarratorSessionError(
            "No narrator turn is available for suggested actions",
            status_code=HTTPStatus.CONFLICT,
        )
    if payload.source_turn_id is not None and payload.source_turn_id != latest_narration.id:
        raise NarratorSessionError(
            "Suggested actions can only be regenerated for the latest narrator turn",
            status_code=HTTPStatus.CONFLICT,
        )

    output = await _suggest_turn_actions(
        context,
        source_turn=latest_narration,
        turns_context=turns,
        payload=payload,
    )
    story_runtime_store.delete_session_suggested_actions_for_source(
        context.session.id,
        latest_narration.id,
    )
    suggested_actions = _persist_suggested_actions_from_items(
        context.session.id,
        latest_narration.id,
        output.suggested_actions,
    )
    project_store.touch_project(context.project.id)
    session = story_runtime_store.get_chapter_session(context.project.id, context.session.id) or context.session
    return NarratorSuggestedActionsResponse(
        session=session,
        source_turn=latest_narration,
        suggested_actions=suggested_actions,
        warnings=output.warnings,
    )


async def rollback_session(
    session_id: str,
    payload: NarratorRollbackRequest,
) -> NarratorSessionDetail | None:
    context = _load_context(session_id)
    if context is None:
        return None
    _require_active_replay_context(context)

    turns = story_runtime_store.list_session_turns(context.session.id)
    target_turn = next((turn for turn in turns if turn.id == payload.target_turn_id), None)
    if target_turn is None:
        return None

    if target_turn.actor_type == "user":
        if payload.user_turn_mode == "redo":
            story_runtime_store.delete_session_turn_tail(context.session.id, target_turn.turn_index)
        else:
            await _regenerate_after_user_turn(context, turns, target_turn, payload.comment)
    elif target_turn.actor_type == "ai" and target_turn.turn_type == "narration":
        await _regenerate_from_turn(context, turns, target_turn, payload.comment)
    else:
        raise NarratorSessionError(
            "Only user turns and narrator turns can be rollback targets",
            status_code=HTTPStatus.CONFLICT,
        )

    project_store.touch_project(context.project.id)
    return get_session_detail(session_id)


def pause_session(session_id: str) -> NarratorSessionDetail | None:
    context = _load_context(session_id)
    if context is None:
        return None
    runtime_status.require_creative_write(context.project.id)
    if context.session.status == "completed":
        raise NarratorSessionError("Completed sessions cannot be paused", status_code=HTTPStatus.CONFLICT)
    if context.session.status == "preparing":
        raise NarratorSessionError("Session must be started before it can be paused", status_code=HTTPStatus.CONFLICT)

    session = story_runtime_store.update_chapter_session(
        context.project.id,
        context.session.id,
        ChapterSessionUpdate(status="paused", paused_at=_now()),
    )
    project_store.touch_project(context.project.id)
    return get_session_detail(session_id) or _detail(_replace_session(context, session or context.session))


def complete_session(session_id: str) -> NarratorSessionDetail | None:
    context = _load_context(session_id)
    if context is None:
        return None
    runtime_status.require_creative_write(context.project.id)
    if context.session.status == "preparing":
        raise NarratorSessionError("Session must be started before it can be completed", status_code=HTTPStatus.CONFLICT)
    if context.session.status in {"draft_ready", "reviewed"}:
        raise NarratorSessionError("Session is already past narrator mode", status_code=HTTPStatus.CONFLICT)

    session = story_runtime_store.update_chapter_session(
        context.project.id,
        context.session.id,
        ChapterSessionUpdate(status="completed", completed_at=_now()),
    )
    if context.chapter is not None:
        story_runtime_store.update_chapter(
            context.project.id,
            context.chapter.id,
            ChapterUpdate(status="session_done", session_id=context.session.id),
        )
    project_store.touch_project(context.project.id)
    return get_session_detail(session_id) or _detail(_replace_session(context, session or context.session))


def update_turn_flags(
    session_id: str,
    turn_id: str,
    payload: NarratorTurnFlagUpdateRequest,
) -> SessionTurnRecord | None:
    context = _load_context(session_id)
    if context is None:
        return None
    runtime_status.require_creative_write(context.project.id)
    turn = story_runtime_store.update_session_turn_flags(
        context.session.id,
        turn_id,
        is_key_event=payload.is_key_event,
        exclude_from_draft=payload.exclude_from_draft,
    )
    if turn is not None:
        project_store.touch_project(context.project.id)
    return turn


def update_key_event(
    session_id: str,
    event_id: str,
    payload: NarratorKeyEventUpdateRequest,
) -> KeyEventRecord | None:
    context = _load_context(session_id)
    if context is None:
        return None
    runtime_status.require_creative_write(context.project.id)
    update = KeyEventUpdate(**payload.model_dump(exclude_unset=True))
    event = story_runtime_store.update_key_event(context.session.id, event_id, update)
    if event is not None:
        project_store.touch_project(context.project.id)
    return event


def _require_active_replay_context(context: NarratorContext) -> None:
    runtime_status.require_creative_write(context.project.id)
    if context.session.status != "active":
        raise NarratorSessionError(
            "Session must be active before replaying narrator turns",
            status_code=HTTPStatus.CONFLICT,
        )


async def _regenerate_from_turn(
    context: NarratorContext,
    turns: list[SessionTurnRecord],
    target_turn: SessionTurnRecord,
    comment: str | None,
) -> None:
    previous_user_turn = next(
        (
            turn
            for turn in reversed(turns)
            if turn.turn_index < target_turn.turn_index and turn.actor_type == "user"
        ),
        None,
    )
    if previous_user_turn is None:
        raise NarratorSessionError(
            "A narrator opening without a previous user turn cannot be regenerated here",
            status_code=HTTPStatus.CONFLICT,
        )

    turns_context = [turn for turn in turns if turn.turn_index < target_turn.turn_index]
    output = await _narrate_existing_user_turn(
        context,
        previous_user_turn,
        turns_context=turns_context,
        regeneration_comment=comment,
    )
    story_runtime_store.delete_session_turn_tail(context.session.id, target_turn.turn_index)
    _persist_ai_turn_output(context, output)


async def _regenerate_after_user_turn(
    context: NarratorContext,
    turns: list[SessionTurnRecord],
    target_turn: SessionTurnRecord,
    comment: str | None,
) -> None:
    turns_context = [turn for turn in turns if turn.turn_index <= target_turn.turn_index]
    output = await _narrate_existing_user_turn(
        context,
        target_turn,
        turns_context=turns_context,
        regeneration_comment=comment,
    )
    story_runtime_store.delete_session_turn_tail(context.session.id, target_turn.turn_index + 1)
    _persist_ai_turn_output(context, output)


async def _narrate_existing_user_turn(
    context: NarratorContext,
    user_turn: SessionTurnRecord,
    *,
    turns_context: list[SessionTurnRecord],
    regeneration_comment: str | None,
) -> NarrateTurnOutput:
    payload = NarratorTurnRequest(
        input_type=_input_type_from_turn(user_turn),
        content=user_turn.content,
    )
    selected_action = story_runtime_store.get_session_suggested_action_for_selected_turn(
        context.session.id,
        user_turn.id,
    )
    return await _narrate(
        context,
        payload,
        user_turn,
        selected_action,
        turns_context=turns_context,
        regeneration_comment=regeneration_comment,
    )


def _load_context(session_id: str) -> NarratorContext | None:
    session = story_runtime_store.get_chapter_session_by_id(session_id)
    if session is None:
        return None
    project = project_store.get_project(session.project_id, include_hidden=True)
    if project is None:
        return None
    chapter = (
        story_runtime_store.get_chapter(project.id, session.chapter_id)
        if session.chapter_id
        else None
    )
    return NarratorContext(project=project, chapter=chapter, session=session)


def _detail(context: NarratorContext) -> NarratorSessionDetail:
    turns = story_runtime_store.list_session_turns(context.session.id)
    return NarratorSessionDetail(
        project=context.project,
        chapter=context.chapter,
        session=context.session,
        turns=turns,
        suggested_actions=story_runtime_store.list_session_suggested_actions(context.session.id),
        key_events=story_runtime_store.list_key_events(context.session.id),
        memory_proposals=_session_memory_proposals(context.project.id, turns),
    )


def _log_response(context: NarratorContext) -> NarratorSessionLogResponse:
    turns = story_runtime_store.list_session_turns(context.session.id)
    return NarratorSessionLogResponse(
        project=context.project,
        chapter=context.chapter,
        session=context.session,
        turns=turns,
        suggested_actions=story_runtime_store.list_session_suggested_actions(context.session.id),
        key_events=story_runtime_store.list_key_events(context.session.id),
        memory_proposals=_session_memory_proposals(context.project.id, turns),
    )


def _replace_session(context: NarratorContext, session: ChapterSessionRecord) -> NarratorContext:
    return NarratorContext(project=context.project, chapter=context.chapter, session=session)


def _validate_selected_action(
    session_id: str,
    payload: NarratorTurnRequest,
    turns_before: list[SessionTurnRecord],
) -> SessionSuggestedActionRecord | None:
    if not payload.selected_option_id:
        return None
    selected_action = story_runtime_store.get_session_suggested_action(
        session_id,
        payload.selected_option_id,
    )
    if selected_action is None:
        raise NarratorSessionError("Suggested action was not found")
    if selected_action.status != "suggested":
        raise NarratorSessionError("Suggested action was already used", status_code=HTTPStatus.CONFLICT)

    latest_ai_turn = next((turn for turn in reversed(turns_before) if turn.actor_type == "ai"), None)
    if latest_ai_turn is not None and selected_action.source_turn_id != latest_ai_turn.id:
        raise NarratorSessionError("Suggested action does not belong to the latest narrator turn")
    return selected_action


def _turn_content(
    payload: NarratorTurnRequest,
    selected_action: SessionSuggestedActionRecord | None,
) -> str:
    if payload.content and payload.content.strip():
        return payload.content.strip()
    if selected_action is not None:
        return selected_action.action
    raise NarratorSessionError("Turn content is empty")


async def _narrate(
    context: NarratorContext,
    payload: NarratorTurnRequest,
    user_turn: SessionTurnRecord,
    selected_action: SessionSuggestedActionRecord | None,
    *,
    turns_context: list[SessionTurnRecord] | None = None,
    regeneration_comment: str | None = None,
) -> NarrateTurnOutput:
    memory_items = [
        item
        for item in story_runtime_store.list_memory_items(context.project.id)
        if item.status != "rejected"
    ]
    story_lines = [
        line
        for line in story_runtime_store.list_story_lines(context.project.id)
        if line.status != "rejected"
    ]
    turns = turns_context or story_runtime_store.list_session_turns(context.session.id)
    agent_instructions = (context.session.agent_instructions or "").strip()
    instructions = [
        "Write one concise narrator turn, not a full chapter.",
        "Offer 2-4 meaningful next actions.",
        "Do not decide key choices for user-controlled characters.",
        "Do not silently change canon; propose memory changes as candidates.",
        "Do not complete the chapter unless the user clearly asks.",
    ]
    if agent_instructions:
        instructions.append(
            "Follow the session AI agent instructions while preserving project canon and user agency."
        )
    cleaned_comment = _clean_optional_text(regeneration_comment)
    if cleaned_comment:
        instructions.append("When regenerating, account for the user's regeneration comment.")

    result = await project_ai_settings.execute_project_action(
        project_id=context.project.id,
        action_type="narrate_turn",
        input={
            "input_type": payload.input_type,
            "content": user_turn.content,
            "selected_option": selected_action.model_dump(mode="json") if selected_action else None,
            "language": "ru",
            "regeneration_comment": cleaned_comment,
        },
        context=AiActionContext(
            synopsis=context.project.synopsis,
            project=context.project.model_dump(mode="json"),
            memory_items=[item.model_dump(mode="json") for item in memory_items],
            story_lines=[line.model_dump(mode="json") for line in story_lines],
            chapter=context.chapter.model_dump(mode="json") if context.chapter else None,
            session=context.session.model_dump(mode="json"),
            turns=[turn.model_dump(mode="json") for turn in turns],
            extra={
                "controlled_characters": _items_by_id(memory_items, context.session.controlled_character_ids),
                "active_story_lines": _lines_by_id(story_lines, context.session.active_story_line_ids),
                "agent_settings": {
                    "instructions": agent_instructions or None,
                },
                "instructions": instructions,
            },
        ),
        privacy_level="project",
    )
    return NarrateTurnOutput.model_validate(result.structured_json)


async def _suggest_turn_actions(
    context: NarratorContext,
    *,
    source_turn: SessionTurnRecord,
    turns_context: list[SessionTurnRecord],
    payload: NarratorSuggestedActionsRegenerateRequest,
) -> SuggestTurnActionsOutput:
    memory_items = [
        item
        for item in story_runtime_store.list_memory_items(context.project.id)
        if item.status != "rejected"
    ]
    story_lines = [
        line
        for line in story_runtime_store.list_story_lines(context.project.id)
        if line.status != "rejected"
    ]
    agent_instructions = (context.session.agent_instructions or "").strip()
    cleaned_prompt = _clean_optional_text(payload.prompt) or _clean_optional_text(payload.comment)
    instructions = [
        "Generate 2-4 possible next user actions for the current narrator turn.",
        "Do not write new narration.",
        "Do not decide key choices for user-controlled characters.",
        "Keep every option actionable and distinct.",
        "Use Russian for labels and action text.",
    ]
    if agent_instructions:
        instructions.append(
            "Follow the session AI agent instructions while preserving project canon and user agency."
        )
    if cleaned_prompt:
        instructions.append("Account for the user's prompt when regenerating action options.")

    result = await project_ai_settings.execute_project_action(
        project_id=context.project.id,
        action_type="suggest_turn_actions",
        input={
            "source_turn": source_turn.model_dump(mode="json"),
            "prompt": cleaned_prompt,
            "comment": _clean_optional_text(payload.comment),
            "language": "ru",
        },
        context=AiActionContext(
            synopsis=context.project.synopsis,
            project=context.project.model_dump(mode="json"),
            memory_items=[item.model_dump(mode="json") for item in memory_items],
            story_lines=[line.model_dump(mode="json") for line in story_lines],
            chapter=context.chapter.model_dump(mode="json") if context.chapter else None,
            session=context.session.model_dump(mode="json"),
            turns=[turn.model_dump(mode="json") for turn in turns_context],
            extra={
                "controlled_characters": _items_by_id(memory_items, context.session.controlled_character_ids),
                "active_story_lines": _lines_by_id(story_lines, context.session.active_story_line_ids),
                "agent_settings": {
                    "instructions": agent_instructions or None,
                },
                "instructions": instructions,
            },
        ),
        privacy_level="project",
    )
    return SuggestTurnActionsOutput.model_validate(result.structured_json)


def _persist_ai_turn_output(
    context: NarratorContext,
    output: NarrateTurnOutput,
) -> tuple[
    SessionTurnRecord,
    list[SessionSuggestedActionRecord],
    list[KeyEventRecord],
    list[MemoryProposalRecord],
]:
    ai_turn = story_runtime_store.create_session_turn(
        context.session.id,
        SessionTurnCreate(
            turn_index=story_runtime_store.next_session_turn_index(context.session.id),
            actor_type="ai",
            turn_type="narration",
            content=output.narration_markdown,
            related_memory_item_ids=context.session.controlled_character_ids,
            related_story_line_ids=context.session.active_story_line_ids,
        ),
    )
    suggested_actions = _persist_suggested_actions(context.session.id, ai_turn.id, output)
    key_events = _persist_key_events(context, ai_turn.id, output)
    memory_proposals = _persist_memory_proposals(context.project.id, ai_turn.id, output)
    return ai_turn, suggested_actions, key_events, memory_proposals


def _input_type_from_turn(turn: SessionTurnRecord) -> NarratorInputType:
    if turn.turn_type in {"action", "dialogue", "author_command", "choice", "note"}:
        return turn.turn_type
    return "note"


def _persist_suggested_actions(
    session_id: str,
    source_turn_id: str,
    output: NarrateTurnOutput,
) -> list[SessionSuggestedActionRecord]:
    return _persist_suggested_actions_from_items(session_id, source_turn_id, output.suggested_actions)


def _persist_suggested_actions_from_items(
    session_id: str,
    source_turn_id: str,
    items: list[AiSuggestedAction],
) -> list[SessionSuggestedActionRecord]:
    return [
        story_runtime_store.create_session_suggested_action(
            session_id,
            SessionSuggestedActionCreate(
                source_turn_id=source_turn_id,
                action_index=index,
                label=item.label,
                action=item.action,
                tone=item.tone,
            ),
        )
        for index, item in enumerate(items, start=1)
    ]


def _persist_key_events(
    context: NarratorContext,
    ai_turn_id: str,
    output: NarrateTurnOutput,
) -> list[KeyEventRecord]:
    memory_items = story_runtime_store.list_memory_items(context.project.id)
    story_lines = story_runtime_store.list_story_lines(context.project.id)
    events: list[KeyEventRecord] = []
    for item in output.key_event_candidates:
        event = story_runtime_store.create_key_event(
            context.project.id,
            KeyEventCreate(
                session_id=context.session.id,
                chapter_id=context.chapter.id if context.chapter else None,
                source_turn_id=ai_turn_id,
                title=item.title,
                summary=item.summary,
                consequences=item.consequences,
                related_memory_item_ids=_ids_by_title(memory_items, item.related_memory_titles),
                related_story_line_ids=_ids_by_title(story_lines, item.related_story_line_titles),
                include_in_draft=True,
            ),
        )
        story_runtime_store.update_session_turn_flags(context.session.id, ai_turn_id, is_key_event=True)
        events.append(event)
    return events


def _persist_memory_proposals(
    project_id: str,
    ai_turn_id: str,
    output: NarrateTurnOutput,
) -> list[MemoryProposalRecord]:
    proposals: list[MemoryProposalRecord] = []
    for item in output.memory_proposal_candidates:
        suggested_payload = dict(item.suggested_payload)
        if item.title and "title" not in suggested_payload:
            suggested_payload["title"] = item.title
        proposal = story_runtime_store.create_memory_proposal(
            project_id,
            MemoryProposalCreate(
                proposal_type=item.proposal_type,
                suggested_payload=suggested_payload,
                reason=item.reason,
                source_type="session_turn",
                source_id=ai_turn_id,
                status="pending",
            ),
        )
        proposals.append(proposal)
    return proposals


def _session_memory_proposals(
    project_id: str,
    turns: list[SessionTurnRecord],
) -> list[MemoryProposalRecord]:
    turn_ids = {turn.id for turn in turns}
    return [
        proposal
        for proposal in story_runtime_store.list_memory_proposals(project_id)
        if proposal.source_type == "session_turn" and proposal.source_id in turn_ids
    ]


def _create_system_error_turn(session_id: str) -> None:
    story_runtime_store.create_session_turn(
        session_id,
        SessionTurnCreate(
            turn_index=story_runtime_store.next_session_turn_index(session_id),
            actor_type="system",
            turn_type="note",
            content="AI не смог ответить на этот ход. Проверь подключение к модели и попробуй продолжить сессию.",
            exclude_from_draft=True,
        ),
    )


def _items_by_id(items: list[MemoryItemRecord], item_ids: list[str]) -> list[dict[str, object]]:
    selected = set(item_ids)
    return [item.model_dump(mode="json") for item in items if item.id in selected]


def _lines_by_id(lines: list[StoryLineRecord], line_ids: list[str]) -> list[dict[str, object]]:
    selected = set(line_ids)
    return [line.model_dump(mode="json") for line in lines if line.id in selected]


def _ids_by_title(
    records: list[MemoryItemRecord] | list[StoryLineRecord],
    titles: list[str],
) -> list[str]:
    index = {_normalize_title(record.title): record.id for record in records}
    ids: list[str] = []
    for title in titles:
        record_id = index.get(_normalize_title(title))
        if record_id and record_id not in ids:
            ids.append(record_id)
    return ids


def _normalize_title(value: str) -> str:
    return value.strip().casefold()


def _clean_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _now() -> str:
    return datetime.now(UTC).isoformat()
