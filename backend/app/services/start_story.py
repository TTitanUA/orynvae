from __future__ import annotations

from app.ai import service as ai_service
from app.models.ai_actions import (
    AiActionContext,
    AiActionRequest,
    AnalyzeSynopsisOutput,
    ExtractStoryMemoryOutput,
    SuggestStartPointsOutput,
    SuggestStoryLinesOutput,
)
from app.models.projects import ProjectCreate
from app.models.start_story import (
    StartStoryAnalysisResponse,
    StartStoryAnalyzeRequest,
    StartStoryConfirmRequest,
    StartStoryConfirmResponse,
    StartStoryLineCandidate,
    StartStoryMemoryCandidate,
    StartStoryPointCandidate,
    StartStoryQuestion,
    StartStoryRefineRequest,
)
from app.models.story_runtime import ChapterCreate, MemoryItemCreate, StoryLineCreate
from app.services import project_store, story_runtime_store


async def analyze_start_story(payload: StartStoryAnalyzeRequest) -> StartStoryAnalysisResponse:
    cleaned = _clean_analyze_payload(payload)
    return await _generate_start_story_analysis(
        source_synopsis=cleaned.synopsis,
        title=cleaned.title,
        tone=cleaned.tone,
        avoid=cleaned.avoid,
        preferred_user_role=cleaned.preferred_user_role,
        provider_id=cleaned.provider_id,
        model_id=cleaned.model_id,
        temperature=cleaned.temperature,
        top_p=cleaned.top_p,
        reasoning_effort=cleaned.reasoning_effort,
        base_input=_analysis_input(cleaned),
    )


async def refine_start_story(payload: StartStoryRefineRequest) -> StartStoryAnalysisResponse:
    cleaned = _clean_refine_payload(payload)
    current_state = _current_analysis_state(cleaned)
    return await _generate_start_story_analysis(
        source_synopsis=cleaned.source_synopsis,
        title=cleaned.title,
        tone=cleaned.tone,
        avoid=cleaned.avoid,
        preferred_user_role=cleaned.preferred_user_role,
        provider_id=cleaned.provider_id,
        model_id=cleaned.model_id,
        temperature=cleaned.temperature,
        top_p=cleaned.top_p,
        reasoning_effort=cleaned.reasoning_effort,
        base_input=_refine_input(cleaned, current_state),
        context_extra={
            "mode": "refine_start_story",
            "user_feedback": cleaned.feedback,
            "current_analysis": current_state,
        },
        response_title=cleaned.current_project_title or cleaned.title,
    )


async def _generate_start_story_analysis(
    *,
    source_synopsis: str,
    title: str | None,
    tone: str | None,
    avoid: str | None,
    preferred_user_role: str | None,
    provider_id: str | None,
    model_id: str | None,
    temperature: float,
    top_p: float | None,
    reasoning_effort: str | None,
    base_input: dict[str, object],
    context_extra: dict[str, object] | None = None,
    response_title: str | None = None,
) -> StartStoryAnalysisResponse:
    context_extra = context_extra or {}
    analysis_result = await ai_service.execute_action(
        AiActionRequest(
            action_type="analyze_synopsis",
            provider_id=provider_id,
            model_id=model_id,
            input=base_input,
            context=AiActionContext(synopsis=source_synopsis, extra=context_extra),
            privacy_level="project",
            temperature=temperature,
            top_p=top_p,
            reasoning_effort=reasoning_effort,
        )
    )
    analysis = AnalyzeSynopsisOutput.model_validate(analysis_result.structured_json)
    provider = analysis_result.provider
    analysis_context = AiActionContext(
        synopsis=source_synopsis,
        extra={
            **context_extra,
            "title": title,
            "tone": tone,
            "avoid": avoid,
            "preferred_user_role": preferred_user_role,
            "analysis": analysis.model_dump(mode="json"),
        },
    )

    memory_result = await ai_service.execute_action(
        AiActionRequest(
            action_type="extract_story_memory",
            provider_id=provider.provider_id,
            model_id=provider.model_id,
            input=base_input,
            context=analysis_context,
            privacy_level="project",
            temperature=temperature,
            top_p=top_p,
            reasoning_effort=reasoning_effort,
        )
    )
    memory_output = ExtractStoryMemoryOutput.model_validate(memory_result.structured_json)

    lines_result = await ai_service.execute_action(
        AiActionRequest(
            action_type="suggest_story_lines",
            provider_id=provider.provider_id,
            model_id=provider.model_id,
            input=base_input,
            context=analysis_context,
            privacy_level="project",
            temperature=temperature,
            top_p=top_p,
            reasoning_effort=reasoning_effort,
        )
    )
    lines_output = SuggestStoryLinesOutput.model_validate(lines_result.structured_json)

    start_points_result = await ai_service.execute_action(
        AiActionRequest(
            action_type="suggest_start_points",
            provider_id=provider.provider_id,
            model_id=provider.model_id,
            input=base_input,
            context=analysis_context,
            privacy_level="project",
            temperature=temperature,
            top_p=top_p,
            reasoning_effort=reasoning_effort,
        )
    )
    start_points_output = SuggestStartPointsOutput.model_validate(
        start_points_result.structured_json
    )

    return StartStoryAnalysisResponse(
        source_synopsis=source_synopsis,
        title=response_title or title,
        tone=tone,
        avoid=avoid,
        preferred_user_role=preferred_user_role,
        provider_id=provider.provider_id,
        model_id=provider.model_id,
        provider_name=provider.provider_name,
        provider_is_external=provider.is_external,
        understood_synopsis=analysis.understood_synopsis,
        emotional_core=analysis.emotional_core,
        suggested_title=analysis.suggested_title,
        questions=[
            StartStoryQuestion(question=question.question, why=question.why)
            for question in analysis.questions
        ],
        warnings=[
            *analysis.warnings,
            *memory_output.warnings,
            *lines_output.warnings,
            *start_points_output.warnings,
        ],
        memory_items=[
            StartStoryMemoryCandidate(
                type=item.type,
                title=item.title,
                summary=item.summary,
                body=item.body,
                importance=item.importance,
                reason=item.reason,
            )
            for item in memory_output.memory_items
        ],
        story_lines=[
            StartStoryLineCandidate(
                type=line.type,
                title=line.title,
                description=line.description,
                current_state=line.current_state,
                priority=line.priority,
                reason=line.reason,
            )
            for line in lines_output.story_lines
        ],
        start_points=[
            StartStoryPointCandidate(
                title=start_point.title,
                situation=start_point.situation,
                present_character_titles=start_point.present_character_titles,
                tension=start_point.tension,
                user_role_hint=start_point.user_role_hint,
            )
            for start_point in start_points_output.start_points
        ],
    )


def confirm_start_story(payload: StartStoryConfirmRequest) -> StartStoryConfirmResponse:
    cleaned = _clean_confirm_payload(payload)
    resolved = ai_service.resolve_action_provider(
        AiActionRequest(
            action_type="analyze_synopsis",
            provider_id=cleaned.provider_id,
            model_id=cleaned.model_id,
            privacy_level="project",
        )
    )
    project = project_store.create_project(
        ProjectCreate(
            title=cleaned.project_title,
            synopsis=cleaned.understood_synopsis or cleaned.source_synopsis,
            active_provider_id=resolved.provider.id,
            active_model_id=resolved.model.model_id,
            expansion_policy=cleaned.expansion_policy,
        )
    )

    created_memory_items = [
        story_runtime_store.create_memory_item(
            project.id,
            MemoryItemCreate(
                type=item.type,
                title=item.title,
                summary=item.summary,
                body=item.body,
                status=item.status,
                source_type="start_story",
                importance=item.importance,
            ),
        )
        for item in cleaned.memory_items
        if item.status != "rejected"
    ]
    created_story_lines = [
        story_runtime_store.create_story_line(
            project.id,
            StoryLineCreate(
                type=line.type,
                title=line.title,
                description=line.description,
                current_state=line.current_state,
                status=line.status,
                priority=line.priority,
            ),
        )
        for line in cleaned.story_lines
        if line.status != "rejected"
    ]

    initial_chapter = None
    if cleaned.selected_start_point is not None and not cleaned.skip_start_point:
        initial_chapter = story_runtime_store.create_chapter(
            project.id,
            ChapterCreate(
                title=cleaned.selected_start_point.title,
                order_index=1,
                status="planned",
                synopsis=_start_point_synopsis(cleaned.selected_start_point),
            ),
        )

    return StartStoryConfirmResponse(
        project=project,
        created_memory_items=created_memory_items,
        created_story_lines=created_story_lines,
        initial_chapter=initial_chapter,
        start_points=[cleaned.selected_start_point] if cleaned.selected_start_point else [],
    )


def _clean_analyze_payload(payload: StartStoryAnalyzeRequest) -> StartStoryAnalyzeRequest:
    return payload.model_copy(
        update={
            "synopsis": payload.synopsis.strip(),
            "title": _clean_optional(payload.title),
            "tone": _clean_optional(payload.tone),
            "avoid": _clean_optional(payload.avoid),
            "preferred_user_role": _clean_optional(payload.preferred_user_role),
            "provider_id": _clean_optional(payload.provider_id),
            "model_id": _clean_optional(payload.model_id),
        }
    )


def _clean_refine_payload(payload: StartStoryRefineRequest) -> StartStoryRefineRequest:
    return payload.model_copy(
        update={
            "source_synopsis": payload.source_synopsis.strip(),
            "title": _clean_optional(payload.title),
            "tone": _clean_optional(payload.tone),
            "avoid": _clean_optional(payload.avoid),
            "preferred_user_role": _clean_optional(payload.preferred_user_role),
            "provider_id": _clean_optional(payload.provider_id),
            "model_id": _clean_optional(payload.model_id),
            "feedback": payload.feedback.strip(),
            "current_project_title": _clean_optional(payload.current_project_title),
            "current_understood_synopsis": _clean_optional(payload.current_understood_synopsis),
            "current_emotional_core": _clean_optional(payload.current_emotional_core),
        }
    )


def _clean_confirm_payload(payload: StartStoryConfirmRequest) -> StartStoryConfirmRequest:
    return payload.model_copy(
        update={
            "source_synopsis": payload.source_synopsis.strip(),
            "project_title": payload.project_title.strip(),
            "understood_synopsis": _clean_optional(payload.understood_synopsis),
            "provider_id": _clean_optional(payload.provider_id),
            "model_id": _clean_optional(payload.model_id),
        }
    )


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _current_analysis_state(payload: StartStoryRefineRequest) -> dict[str, object]:
    return {
        "project_title": payload.current_project_title,
        "understood_synopsis": payload.current_understood_synopsis,
        "emotional_core": payload.current_emotional_core,
        "questions": [question.model_dump(mode="json") for question in payload.current_questions],
        "memory_items": [item.model_dump(mode="json") for item in payload.current_memory_items],
        "story_lines": [line.model_dump(mode="json") for line in payload.current_story_lines],
        "start_points": [point.model_dump(mode="json") for point in payload.current_start_points],
    }


def _analysis_input(payload: StartStoryAnalyzeRequest) -> dict[str, object]:
    return {
        "synopsis": payload.synopsis,
        "title": payload.title,
        "tone": payload.tone,
        "avoid": payload.avoid,
        "preferred_user_role": payload.preferred_user_role,
        "language": "ru",
    }


def _refine_input(
    payload: StartStoryRefineRequest,
    current_state: dict[str, object],
) -> dict[str, object]:
    return {
        "mode": "refine_start_story_analysis",
        "source_synopsis": payload.source_synopsis,
        "title": payload.title,
        "tone": payload.tone,
        "avoid": payload.avoid,
        "preferred_user_role": payload.preferred_user_role,
        "user_feedback": payload.feedback,
        "current_analysis": current_state,
        "language": "ru",
        "instructions": [
            "Update the current start-story proposal according to user_feedback.",
            "Treat user answers to open questions as new source context.",
            "Keep useful existing candidates unless the feedback contradicts them.",
            "Ask only questions that remain necessary after applying the feedback.",
        ],
    }


def _start_point_synopsis(start_point: StartStoryPointCandidate) -> str:
    parts = [start_point.situation]
    if start_point.tension:
        parts.append(f"Напряжение: {start_point.tension}")
    if start_point.present_character_titles:
        parts.append(f"Участники: {', '.join(start_point.present_character_titles)}")
    if start_point.user_role_hint:
        parts.append(f"Роль пользователя: {start_point.user_role_hint}")
    return "\n\n".join(parts)
