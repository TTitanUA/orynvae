from __future__ import annotations

from dataclasses import dataclass
from http import HTTPStatus

from app.ai import service as ai_service
from app.models.ai_actions import (
    AiActionContext,
    AiActionRequest,
    AssembleDraftOutput,
    EditMarkdownFragmentOutput,
    ForecastNextOutput,
    ReviewChapterOutput,
)
from app.models.memory import MemoryProposalAcceptRequest, MemoryProposalRejectRequest
from app.models.projects import ProjectRecord
from app.models.stage7 import (
    ChapterReviewApplyRequest,
    ChapterReviewCreate,
    ChapterReviewGenerateRequest,
    ChapterReviewMemoryDecision,
    ChapterReviewNoteCreate,
    ChapterReviewNoteDecision,
    ChapterReviewNoteStatusPatch,
    ChapterReviewResponse,
    ChapterReviewStoryLineDecision,
    ChapterReviewStoryLineUpdateCreate,
    ChapterReviewStoryLineUpdateStatusPatch,
    DraftAssemblyRequest,
    DraftAssemblyResponse,
    DraftAssistRequest,
    DraftAssistResponse,
    DraftUpdateRequest,
    DraftUpdateResponse,
    ForecastGenerateRequest,
)
from app.models.story_runtime import (
    ChapterRecord,
    ChapterSessionRecord,
    ChapterSessionUpdate,
    ChapterUpdate,
    DraftVersionCreate,
    DraftVersionRecord,
    ForecastCreate,
    ForecastOptionCreate,
    ForecastRecord,
    KeyEventRecord,
    MemoryItemRecord,
    MemoryProposalCreate,
    MemoryProposalRecord,
    SessionTurnRecord,
    StoryLineProgressCreate,
    StoryLineRecord,
    StoryLineUpdate,
)
from app.services import memory as memory_service
from app.services import project_store, runtime_status, story_runtime_store


class Stage7Error(Exception):
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
class SessionContext:
    project: ProjectRecord
    chapter: ChapterRecord
    session: ChapterSessionRecord


def list_draft_versions(project_id: str, chapter_id: str) -> list[DraftVersionRecord] | None:
    if story_runtime_store.get_chapter(project_id, chapter_id) is None:
        return None
    return story_runtime_store.list_draft_versions(project_id, chapter_id)


async def assemble_draft(
    session_id: str,
    payload: DraftAssemblyRequest,
) -> DraftAssemblyResponse | None:
    context = _load_session_context(session_id)
    if context is None:
        return None
    runtime_status.require_creative_write(context.project.id)
    if context.session.status not in {"completed", "draft_ready"}:
        raise Stage7Error("Session must be completed before assembling a draft", status_code=HTTPStatus.CONFLICT)

    turns = story_runtime_store.list_session_turns(context.session.id)
    key_events = story_runtime_store.list_key_events(context.session.id)
    included_turns = _included_turns(turns, payload.excluded_turn_ids)
    included_key_events = _included_key_events(key_events, payload.required_event_ids)
    memory_items = _memory_items(context.project.id)
    story_lines = _story_lines(context.project.id)

    result = await ai_service.execute_action(
        AiActionRequest(
            action_type="assemble_draft",
            project_id=context.project.id,
            provider_id=payload.provider_id or context.project.active_provider_id,
            model_id=payload.model_id or context.project.active_model_id,
            input={
                "mode": payload.mode,
                "required_event_ids": payload.required_event_ids,
                "excluded_turn_ids": payload.excluded_turn_ids,
                "style_notes": _clean_optional(payload.style_notes),
                "language": "ru",
            },
            context=AiActionContext(
                synopsis=context.project.synopsis,
                project=context.project.model_dump(mode="json"),
                memory_items=[item.model_dump(mode="json") for item in memory_items],
                story_lines=[line.model_dump(mode="json") for line in story_lines],
                chapter=context.chapter.model_dump(mode="json"),
                session=context.session.model_dump(mode="json"),
                turns=[turn.model_dump(mode="json") for turn in included_turns],
                extra={
                    "all_turns_count": len(turns),
                    "included_key_events": [
                        event.model_dump(mode="json") for event in included_key_events
                    ],
                    "active_story_lines": _lines_by_id(story_lines, context.session.active_story_line_ids),
                    "controlled_characters": _items_by_id(memory_items, context.session.controlled_character_ids),
                    "instructions": [
                        "Assemble literary markdown from the lived session log.",
                        "Preserve key user decisions and consequences.",
                        "Do not add new canon; leave facts as prose unless confirmed later.",
                        "Return markdown only in the structured markdown field.",
                    ],
                },
            ),
            privacy_level="project",
            temperature=payload.temperature,
            top_p=payload.top_p,
            reasoning_effort=payload.reasoning_effort,
        )
    )
    output = AssembleDraftOutput.model_validate(result.structured_json)
    draft = story_runtime_store.create_draft_version(
        context.project.id,
        DraftVersionCreate(
            chapter_id=context.chapter.id,
            source_session_id=context.session.id,
            mode=payload.mode,
            markdown=output.markdown,
            status="generated",
        ),
    )
    chapter = story_runtime_store.update_chapter(
        context.project.id,
        context.chapter.id,
        ChapterUpdate(status="draft_generated", draft_markdown=output.markdown),
    )
    session = story_runtime_store.update_chapter_session(
        context.project.id,
        context.session.id,
        ChapterSessionUpdate(status="draft_ready"),
    )
    project_store.touch_project(context.project.id)
    return DraftAssemblyResponse(
        project=context.project,
        chapter=chapter or context.chapter,
        session=session or context.session,
        draft_version=draft,
        warnings=output.warnings,
    )


def update_draft(
    project_id: str,
    chapter_id: str,
    payload: DraftUpdateRequest,
) -> DraftUpdateResponse | None:
    project = project_store.get_project(project_id, include_hidden=True)
    chapter = story_runtime_store.get_chapter(project_id, chapter_id)
    if project is None or chapter is None:
        return None
    runtime_status.require_creative_write(project_id)
    draft = story_runtime_store.create_draft_version(
        project_id,
        DraftVersionCreate(
            chapter_id=chapter_id,
            source_session_id=chapter.session_id,
            mode=payload.mode,
            markdown=payload.markdown,
            status=payload.status,
        ),
    )
    chapter = story_runtime_store.update_chapter(
        project_id,
        chapter_id,
        ChapterUpdate(status="draft_generated", draft_markdown=payload.markdown),
    )
    project_store.touch_project(project_id)
    return DraftUpdateResponse(chapter=chapter, draft_version=draft) if chapter else None


async def assist_draft(
    project_id: str,
    chapter_id: str,
    payload: DraftAssistRequest,
) -> DraftAssistResponse | None:
    project = project_store.get_project(project_id, include_hidden=True)
    chapter = story_runtime_store.get_chapter(project_id, chapter_id)
    if project is None or chapter is None:
        return None
    runtime_status.require_creative_write(project_id)
    latest = story_runtime_store.get_latest_draft_version(project_id, chapter_id)
    draft_markdown = latest.markdown if latest is not None else chapter.draft_markdown
    if not draft_markdown.strip():
        raise Stage7Error("Chapter has no draft markdown to edit", status_code=HTTPStatus.CONFLICT)

    session = (
        story_runtime_store.get_chapter_session(project_id, chapter.session_id)
        if chapter.session_id
        else None
    )
    turns = story_runtime_store.list_session_turns(session.id) if session else []
    result = await ai_service.execute_action(
        AiActionRequest(
            action_type="edit_markdown_fragment",
            project_id=project_id,
            provider_id=payload.provider_id or project.active_provider_id,
            model_id=payload.model_id or project.active_model_id,
            input={
                "instructions": payload.instructions,
                "language": "ru",
            },
            context=AiActionContext(
                synopsis=project.synopsis,
                project=project.model_dump(mode="json"),
                memory_items=[item.model_dump(mode="json") for item in _memory_items(project_id)],
                story_lines=[line.model_dump(mode="json") for line in _story_lines(project_id)],
                chapter=chapter.model_dump(mode="json"),
                session=session.model_dump(mode="json") if session else None,
                turns=[turn.model_dump(mode="json") for turn in turns],
                draft_markdown=draft_markdown,
                selection_markdown=payload.selection_markdown,
                instructions=payload.instructions,
            ),
            privacy_level="project",
            temperature=payload.temperature,
            top_p=payload.top_p,
            reasoning_effort=payload.reasoning_effort,
        )
    )
    output = EditMarkdownFragmentOutput.model_validate(result.structured_json)
    return DraftAssistResponse(
        replacement_markdown=output.replacement_markdown,
        rationale=output.rationale,
        warnings=output.warnings,
    )


def get_review(project_id: str, chapter_id: str) -> ChapterReviewResponse | None:
    review = story_runtime_store.get_latest_chapter_review(project_id, chapter_id)
    if review is None:
        return None
    return _review_response(project_id, review)


async def generate_review(
    project_id: str,
    chapter_id: str,
    payload: ChapterReviewGenerateRequest,
) -> ChapterReviewResponse | None:
    project = project_store.get_project(project_id, include_hidden=True)
    chapter = story_runtime_store.get_chapter(project_id, chapter_id)
    if project is None or chapter is None:
        return None
    runtime_status.require_creative_write(project_id)

    draft = _draft_for_review(project_id, chapter_id, payload.source_draft_version_id)
    draft_markdown = draft.markdown if draft is not None else chapter.draft_markdown
    if not draft_markdown.strip():
        raise Stage7Error("Chapter has no draft markdown to review", status_code=HTTPStatus.CONFLICT)

    session = (
        story_runtime_store.get_chapter_session(project_id, draft.source_session_id)
        if draft and draft.source_session_id
        else (
            story_runtime_store.get_chapter_session(project_id, chapter.session_id)
            if chapter.session_id
            else None
        )
    )
    turns = story_runtime_store.list_session_turns(session.id) if session else []
    key_events = story_runtime_store.list_key_events(session.id) if session else []
    memory_items = _memory_items(project_id)
    story_lines = _story_lines(project_id)
    result = await ai_service.execute_action(
        AiActionRequest(
            action_type="review_chapter",
            project_id=project_id,
            provider_id=payload.provider_id or project.active_provider_id,
            model_id=payload.model_id or project.active_model_id,
            input={
                "source_draft_version_id": draft.id if draft else None,
                "language": "ru",
            },
            context=AiActionContext(
                synopsis=project.synopsis,
                project=project.model_dump(mode="json"),
                memory_items=[item.model_dump(mode="json") for item in memory_items],
                story_lines=[line.model_dump(mode="json") for line in story_lines],
                chapter=chapter.model_dump(mode="json"),
                session=session.model_dump(mode="json") if session else None,
                turns=[turn.model_dump(mode="json") for turn in turns],
                draft_markdown=draft_markdown,
                extra={
                    "key_events": [event.model_dump(mode="json") for event in key_events],
                    "instructions": [
                        "Review what changed in the story after this chapter.",
                        "Propose memory and story line updates as pending decisions only.",
                        "Surface contradictions and open questions as warnings, not automatic fixes.",
                    ],
                },
            ),
            privacy_level="project",
            temperature=payload.temperature,
            top_p=payload.top_p,
            reasoning_effort=payload.reasoning_effort,
        )
    )
    output = ReviewChapterOutput.model_validate(result.structured_json)
    review = story_runtime_store.create_chapter_review(
        project_id,
        ChapterReviewCreate(
            chapter_id=chapter.id,
            source_session_id=session.id if session else None,
            source_draft_version_id=draft.id if draft else None,
            summary=output.summary,
            warnings=output.warnings,
        ),
    )
    _persist_review_memory_proposals(project_id, review.id, output)
    _persist_review_story_line_updates(project_id, review.id, story_lines, output)
    _persist_review_notes(project_id, review.id, output)
    story_runtime_store.update_chapter(project_id, chapter.id, ChapterUpdate(status="reviewing"))
    project_store.touch_project(project_id)
    return _review_response(project_id, review)


def apply_review_decisions(
    project_id: str,
    chapter_id: str,
    payload: ChapterReviewApplyRequest,
) -> ChapterReviewResponse | None:
    project = project_store.get_project(project_id, include_hidden=True)
    chapter = story_runtime_store.get_chapter(project_id, chapter_id)
    if project is None or chapter is None:
        return None
    runtime_status.require_creative_write(project_id)
    review = (
        story_runtime_store.get_chapter_review(project_id, payload.review_id)
        if payload.review_id
        else story_runtime_store.get_latest_chapter_review(project_id, chapter_id)
    )
    if review is None or review.chapter_id != chapter_id:
        return None

    for decision in payload.memory_decisions:
        _apply_memory_decision(project_id, review, decision)
    for decision in payload.story_line_decisions:
        _apply_story_line_decision(project_id, chapter, review, decision)
    for decision in payload.note_decisions:
        _apply_note_decision(project_id, review, decision)

    if not _review_has_pending_items(project_id, review.id):
        review = story_runtime_store.update_chapter_review_status(project_id, review.id, "applied") or review
        story_runtime_store.update_chapter(project_id, chapter.id, ChapterUpdate(status="completed"))
        if review.source_session_id:
            story_runtime_store.update_chapter_session(
                project_id,
                review.source_session_id,
                ChapterSessionUpdate(status="reviewed"),
            )
    project_store.touch_project(project_id)
    return _review_response(project_id, review)


def list_forecasts(project_id: str) -> list[ForecastRecord] | None:
    if project_store.get_project(project_id, include_hidden=True) is None:
        return None
    return story_runtime_store.list_forecasts(project_id)


def get_forecast(project_id: str, forecast_id: str) -> ForecastRecord | None:
    if project_store.get_project(project_id, include_hidden=True) is None:
        return None
    return story_runtime_store.get_forecast(project_id, forecast_id)


async def generate_forecast(
    project_id: str,
    payload: ForecastGenerateRequest,
) -> ForecastRecord | None:
    project = project_store.get_project(project_id, include_hidden=True)
    chapter = story_runtime_store.get_chapter(project_id, payload.source_chapter_id)
    if project is None or chapter is None:
        return None
    runtime_status.require_creative_write(project_id)

    story_lines = _story_lines(project_id)
    selected_line_ids = payload.active_story_line_ids or [
        line.id for line in story_lines if line.status in {"active", "proposed", "sleeping"}
    ][:7]
    selected_lines = [line for line in story_lines if line.id in set(selected_line_ids)]
    latest_draft = story_runtime_store.get_latest_draft_version(project_id, chapter.id)
    draft_markdown = latest_draft.markdown if latest_draft else chapter.draft_markdown
    if not draft_markdown.strip():
        raise Stage7Error("Chapter has no draft markdown to forecast", status_code=HTTPStatus.CONFLICT)
    result = await ai_service.execute_action(
        AiActionRequest(
            action_type="forecast_next",
            project_id=project_id,
            provider_id=payload.provider_id or project.active_provider_id,
            model_id=payload.model_id or project.active_model_id,
            input={
                "source_chapter_id": chapter.id,
                "horizon_chapters": payload.horizon_chapters,
                "active_story_line_ids": selected_line_ids,
                "language": "ru",
            },
            context=AiActionContext(
                synopsis=project.synopsis,
                project=project.model_dump(mode="json"),
                memory_items=[item.model_dump(mode="json") for item in _memory_items(project_id)],
                story_lines=[line.model_dump(mode="json") for line in story_lines],
                chapter=chapter.model_dump(mode="json"),
                draft_markdown=draft_markdown,
                extra={
                    "selected_story_lines": [
                        line.model_dump(mode="json") for line in selected_lines
                    ],
                    "story_line_progress": _progress_for_lines(project_id, selected_lines),
                    "instructions": [
                        "Forecast 2-4 possible directions for the next 1-3 chapters.",
                        "Do not lock the ending or write a fixed plot.",
                        "Frame options around soft story lines and likely consequences.",
                    ],
                },
            ),
            privacy_level="project",
            temperature=payload.temperature,
            top_p=payload.top_p,
            reasoning_effort=payload.reasoning_effort,
        )
    )
    output = ForecastNextOutput.model_validate(result.structured_json)
    if not 2 <= len(output.options) <= 4:
        raise Stage7Error("Forecast must include 2-4 options")
    forecast = story_runtime_store.create_forecast(
        project_id,
        ForecastCreate(
            source_chapter_id=chapter.id,
            summary=output.summary,
            options=[
                ForecastOptionCreate(
                    title=option.title,
                    description=option.description,
                    likely_consequences=option.likely_consequences,
                    related_story_line_ids=_ids_by_title(story_lines, option.related_story_line_titles),
                    risks=option.risks,
                )
                for option in output.options
            ],
        ),
    )
    project_store.touch_project(project_id)
    return forecast


def select_forecast_option(
    project_id: str,
    forecast_id: str,
    option_id: str,
) -> ForecastRecord | None:
    if project_store.get_project(project_id, include_hidden=True) is None:
        return None
    runtime_status.require_creative_write(project_id)
    forecast = story_runtime_store.select_forecast_option(project_id, forecast_id, option_id)
    if forecast is not None:
        project_store.touch_project(project_id)
    return forecast


def _load_session_context(session_id: str) -> SessionContext | None:
    session = story_runtime_store.get_chapter_session_by_id(session_id)
    if session is None or not session.chapter_id:
        return None
    project = project_store.get_project(session.project_id, include_hidden=True)
    if project is None:
        return None
    chapter = story_runtime_store.get_chapter(project.id, session.chapter_id)
    if chapter is None:
        return None
    return SessionContext(project=project, chapter=chapter, session=session)


def _included_turns(
    turns: list[SessionTurnRecord],
    excluded_turn_ids: list[str],
) -> list[SessionTurnRecord]:
    excluded = set(excluded_turn_ids)
    return [
        turn
        for turn in turns
        if turn.id not in excluded and not turn.exclude_from_draft and turn.actor_type != "system"
    ]


def _included_key_events(
    events: list[KeyEventRecord],
    required_event_ids: list[str],
) -> list[KeyEventRecord]:
    required = set(required_event_ids)
    missing = required - {event.id for event in events}
    if missing:
        raise Stage7Error("Required key event does not belong to the session")
    return [event for event in events if event.include_in_draft or event.id in required]


def _draft_for_review(
    project_id: str,
    chapter_id: str,
    draft_version_id: str | None,
) -> DraftVersionRecord | None:
    if draft_version_id:
        draft = story_runtime_store.get_draft_version(project_id, draft_version_id)
        if draft is None or draft.chapter_id != chapter_id:
            raise Stage7Error("Draft version was not found", status_code=HTTPStatus.NOT_FOUND)
        return draft
    return story_runtime_store.get_latest_draft_version(project_id, chapter_id)


def _review_response(
    project_id: str,
    review,
) -> ChapterReviewResponse | None:
    project = project_store.get_project(project_id, include_hidden=True)
    chapter = story_runtime_store.get_chapter(project_id, review.chapter_id)
    if project is None or chapter is None:
        return None
    session = (
        story_runtime_store.get_chapter_session(project_id, review.source_session_id)
        if review.source_session_id
        else None
    )
    draft = (
        story_runtime_store.get_draft_version(project_id, review.source_draft_version_id)
        if review.source_draft_version_id
        else None
    )
    return ChapterReviewResponse(
        project=project,
        chapter=chapter,
        session=session,
        draft_version=draft,
        review=review,
        memory_proposals=[
            proposal
            for proposal in story_runtime_store.list_memory_proposals(project_id)
            if proposal.source_type == "chapter_review" and proposal.source_id == review.id
        ],
        story_line_updates=story_runtime_store.list_chapter_review_story_line_updates(
            project_id,
            review.id,
        ),
        notes=story_runtime_store.list_chapter_review_notes(project_id, review.id),
        warnings=review.warnings,
    )


def _persist_review_memory_proposals(
    project_id: str,
    review_id: str,
    output: ReviewChapterOutput,
) -> list[MemoryProposalRecord]:
    proposals: list[MemoryProposalRecord] = []
    for item in output.memory_proposals:
        suggested_payload = dict(item.suggested_payload)
        if item.title and "title" not in suggested_payload:
            suggested_payload["title"] = item.title
        proposals.append(
            story_runtime_store.create_memory_proposal(
                project_id,
                MemoryProposalCreate(
                    proposal_type=item.proposal_type,
                    suggested_payload=suggested_payload,
                    reason=item.reason,
                    source_type="chapter_review",
                    source_id=review_id,
                    status="pending",
                ),
            )
        )
    return proposals


def _persist_review_story_line_updates(
    project_id: str,
    review_id: str,
    story_lines: list[StoryLineRecord],
    output: ReviewChapterOutput,
) -> None:
    for item in output.story_line_updates:
        story_runtime_store.create_chapter_review_story_line_update(
            project_id,
            ChapterReviewStoryLineUpdateCreate(
                review_id=review_id,
                target_story_line_id=_id_by_title(story_lines, item.title),
                title=item.title,
                before_state=item.before_state,
                after_state=item.after_state,
                event_summary=item.event_summary,
                reason=item.reason,
            ),
        )


def _persist_review_notes(project_id: str, review_id: str, output: ReviewChapterOutput) -> None:
    for item in output.contradictions:
        story_runtime_store.create_chapter_review_note(
            project_id,
            ChapterReviewNoteCreate(
                review_id=review_id,
                note_type="contradiction",
                title=item.title,
                body={
                    "description": item.description,
                    "related_memory_titles": item.related_memory_titles,
                    "suggestion": item.suggestion,
                },
                severity=item.severity,
            ),
        )
    for item in output.open_questions:
        story_runtime_store.create_chapter_review_note(
            project_id,
            ChapterReviewNoteCreate(
                review_id=review_id,
                note_type="open_question",
                title=item.question,
                body={"question": item.question, "why": item.why},
            ),
        )


def _apply_memory_decision(project_id: str, review, decision: ChapterReviewMemoryDecision) -> None:
    proposal = story_runtime_store.get_memory_proposal(project_id, decision.proposal_id)
    if proposal is None or proposal.source_type != "chapter_review" or proposal.source_id != review.id:
        raise Stage7Error("Memory proposal decision target was not found", status_code=HTTPStatus.NOT_FOUND)
    if proposal.status != "pending":
        return
    if decision.status in {"accepted", "edited"}:
        result = memory_service.accept_memory_proposal(
            project_id,
            decision.proposal_id,
            MemoryProposalAcceptRequest(
                suggested_payload=decision.suggested_payload,
                target_status=decision.target_status,
            ),
        )
    else:
        result = memory_service.reject_memory_proposal(
            project_id,
            decision.proposal_id,
            MemoryProposalRejectRequest(status=decision.status),
        )
    if result is None:
        raise Stage7Error("Memory proposal decision target was not found", status_code=HTTPStatus.NOT_FOUND)


def _apply_story_line_decision(
    project_id: str,
    chapter: ChapterRecord,
    review,
    decision: ChapterReviewStoryLineDecision,
) -> None:
    update = story_runtime_store.get_chapter_review_story_line_update(project_id, decision.update_id)
    if update is None or update.review_id != review.id:
        raise Stage7Error("Story line update decision target was not found", status_code=HTTPStatus.NOT_FOUND)
    if update.status != "pending":
        return
    if decision.status == "accepted":
        target_id = decision.target_story_line_id or update.target_story_line_id
        if not target_id:
            raise Stage7Error("Accepted story line updates require a target story line")
        line = story_runtime_store.get_story_line(project_id, target_id)
        if line is None:
            raise Stage7Error("Target story line was not found", status_code=HTTPStatus.NOT_FOUND)
        story_runtime_store.create_story_line_progress(
            project_id,
            StoryLineProgressCreate(
                story_line_id=line.id,
                chapter_id=chapter.id,
                session_id=review.source_session_id,
                before_state=update.before_state or line.current_state,
                after_state=update.after_state,
                event_summary=update.event_summary,
            ),
        )
        story_runtime_store.update_story_line(
            project_id,
            line.id,
            StoryLineUpdate(
                current_state=update.after_state,
                last_progress_chapter_id=chapter.id,
                status=decision.target_status,
            ),
        )
    patched = story_runtime_store.update_chapter_review_story_line_update_status(
        project_id,
        update.id,
        ChapterReviewStoryLineUpdateStatusPatch(
            target_story_line_id=decision.target_story_line_id or update.target_story_line_id,
            status=decision.status,
        ),
    )
    if patched is None:
        raise Stage7Error("Story line update decision target was not found", status_code=HTTPStatus.NOT_FOUND)


def _apply_note_decision(project_id: str, review, decision: ChapterReviewNoteDecision) -> None:
    existing = story_runtime_store.get_chapter_review_note(project_id, decision.note_id)
    if existing is None or existing.review_id != review.id:
        raise Stage7Error("Review note decision target was not found", status_code=HTTPStatus.NOT_FOUND)
    if existing.status != "pending":
        return
    note = story_runtime_store.update_chapter_review_note_status(
        project_id,
        decision.note_id,
        ChapterReviewNoteStatusPatch(status=decision.status, decision_note=decision.decision_note),
    )
    if note is None:
        raise Stage7Error("Review note decision target was not found", status_code=HTTPStatus.NOT_FOUND)


def _review_has_pending_items(project_id: str, review_id: str) -> bool:
    memory_pending = any(
        proposal.status == "pending"
        for proposal in story_runtime_store.list_memory_proposals(project_id)
        if proposal.source_type == "chapter_review" and proposal.source_id == review_id
    )
    line_pending = any(
        item.status == "pending"
        for item in story_runtime_store.list_chapter_review_story_line_updates(project_id, review_id)
    )
    note_pending = any(
        item.status == "pending"
        for item in story_runtime_store.list_chapter_review_notes(project_id, review_id)
    )
    return memory_pending or line_pending or note_pending


def _memory_items(project_id: str) -> list[MemoryItemRecord]:
    return [
        item
        for item in story_runtime_store.list_memory_items(project_id)
        if item.status != "rejected"
    ]


def _story_lines(project_id: str) -> list[StoryLineRecord]:
    return [
        line
        for line in story_runtime_store.list_story_lines(project_id)
        if line.status != "rejected"
    ]


def _items_by_id(items: list[MemoryItemRecord], item_ids: list[str]) -> list[dict[str, object]]:
    selected = set(item_ids)
    return [item.model_dump(mode="json") for item in items if item.id in selected]


def _lines_by_id(lines: list[StoryLineRecord], line_ids: list[str]) -> list[dict[str, object]]:
    selected = set(line_ids)
    return [line.model_dump(mode="json") for line in lines if line.id in selected]


def _ids_by_title(records: list[StoryLineRecord], titles: list[str]) -> list[str]:
    index = {_normalize_title(record.title): record.id for record in records}
    ids: list[str] = []
    for title in titles:
        record_id = index.get(_normalize_title(title))
        if record_id and record_id not in ids:
            ids.append(record_id)
    return ids


def _id_by_title(records: list[StoryLineRecord], title: str) -> str | None:
    normalized = _normalize_title(title)
    return next((record.id for record in records if _normalize_title(record.title) == normalized), None)


def _progress_for_lines(project_id: str, lines: list[StoryLineRecord]) -> list[dict[str, object]]:
    progress: list[dict[str, object]] = []
    for line in lines:
        progress.extend(
            item.model_dump(mode="json")
            for item in story_runtime_store.list_story_line_progress(project_id, line.id)
        )
    return progress


def _normalize_title(value: str) -> str:
    return value.strip().casefold()


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None
