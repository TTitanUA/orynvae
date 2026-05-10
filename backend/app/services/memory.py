from __future__ import annotations

from pydantic import ValidationError

from app.models.ai_actions import AiActionContext, CheckContradictionsOutput
from app.models.memory import (
    MemoryConflictCheckRequest,
    MemoryConflictCheckResponse,
    MemoryContradictionWarning,
    MemoryProposalAcceptRequest,
    MemoryProposalDecisionResponse,
    MemoryProposalRejectRequest,
    ProjectWorkspaceSummary,
    WorkspaceMemoryCounts,
    WorkspaceNextStep,
)
from app.models.projects import ProjectRecord
from app.models.story_runtime import (
    ChapterSessionRecord,
    MemoryItemCreate,
    MemoryItemRecord,
    MemoryItemUpdate,
    MemoryProposalRecord,
)
from app.services import project_ai_settings, project_store, runtime_status, story_runtime_store

ALLOWED_PROPOSAL_FIELDS = {
    "type",
    "title",
    "summary",
    "body",
    "status",
    "source_type",
    "source_id",
    "importance",
}


class MemoryProposalApplyError(Exception):
    pass


def accept_memory_proposal(
    project_id: str,
    proposal_id: str,
    payload: MemoryProposalAcceptRequest,
) -> MemoryProposalDecisionResponse | None:
    proposal = story_runtime_store.get_memory_proposal(project_id, proposal_id)
    if proposal is None:
        return None

    suggested_payload = payload.suggested_payload or proposal.suggested_payload
    values = _safe_memory_payload(suggested_payload)
    values["status"] = payload.target_status
    memory_item = _apply_proposal_payload(project_id, proposal, values)
    proposal_status = "edited" if payload.suggested_payload is not None else "accepted"
    updated_proposal = story_runtime_store.update_memory_proposal_status(
        project_id,
        proposal_id,
        proposal_status,
    )
    project_store.touch_project(project_id)
    if updated_proposal is None:
        return None
    return MemoryProposalDecisionResponse(proposal=updated_proposal, memory_item=memory_item)


def reject_memory_proposal(
    project_id: str,
    proposal_id: str,
    payload: MemoryProposalRejectRequest,
) -> MemoryProposalRecord | None:
    proposal = story_runtime_store.update_memory_proposal_status(
        project_id,
        proposal_id,
        payload.status,
    )
    if proposal is not None:
        project_store.touch_project(project_id)
    return proposal


async def check_memory_conflicts(
    project: ProjectRecord,
    payload: MemoryConflictCheckRequest,
) -> MemoryConflictCheckResponse:
    memory_items = [
        item
        for item in story_runtime_store.list_memory_items(project.id)
        if item.status in {"canon", "draft"}
    ]
    result = await project_ai_settings.execute_project_action(
        project_id=project.id,
        action_type="check_contradictions",
        input={
            "content": payload.content,
            "candidate_payload": payload.candidate_payload,
            "target_item_id": payload.target_item_id,
        },
        context=AiActionContext(
            synopsis=project.synopsis,
            project=project.model_dump(mode="json"),
            memory_items=[item.model_dump(mode="json") for item in memory_items],
        ),
        privacy_level="project",
    )
    output = CheckContradictionsOutput.model_validate(result.structured_json)
    return MemoryConflictCheckResponse(
        contradictions=[
            MemoryContradictionWarning(
                title=item.title,
                description=item.description,
                severity=item.severity,
                related_memory_titles=item.related_memory_titles,
                suggestion=item.suggestion,
            )
            for item in output.contradictions
        ],
        warnings=output.warnings,
    )


def get_workspace_summary(project_id: str) -> ProjectWorkspaceSummary | None:
    project = project_store.get_project(project_id)
    if project is None:
        return None

    runtime = runtime_status.get_runtime_status(project_id)
    memory_items = story_runtime_store.list_memory_items(project_id)
    pending_memory_items = [item for item in memory_items if item.status == "proposed"]
    pending_proposals = story_runtime_store.list_memory_proposals(project_id, status="pending")
    story_lines = story_runtime_store.list_story_lines(project_id)
    chapters = story_runtime_store.list_chapters(project_id)
    sessions = story_runtime_store.list_chapter_sessions(project_id)
    active_story_lines = [
        line for line in story_lines if line.status in {"active", "proposed", "sleeping"}
    ][:7]
    active_session = _workspace_session(sessions)
    planned_chapter = next((chapter for chapter in chapters if chapter.status == "planned"), None)
    latest_chapter = chapters[-1] if chapters else None

    warnings: list[str] = []
    if runtime.read_only and runtime.reason:
        warnings.append(runtime.reason)

    return ProjectWorkspaceSummary(
        project=project,
        runtime=runtime,
        next_step=_next_step(
            project_id=project_id,
            read_only=runtime.read_only,
            active_session=active_session,
            planned_chapter_id=planned_chapter.id if planned_chapter else None,
            pending_attention=bool(pending_memory_items or pending_proposals),
        ),
        memory_counts=_memory_counts(memory_items, pending_proposals),
        pending_memory_items=pending_memory_items[:6],
        pending_proposals=pending_proposals[:6],
        active_story_lines=active_story_lines,
        planned_chapter=planned_chapter,
        latest_chapter=latest_chapter,
        active_session=active_session,
        warnings=warnings,
    )


def _apply_proposal_payload(
    project_id: str,
    proposal: MemoryProposalRecord,
    values: dict[str, object],
) -> MemoryItemRecord:
    try:
        if proposal.target_item_id:
            update = MemoryItemUpdate.model_validate(values)
            memory_item = story_runtime_store.update_memory_item(
                project_id,
                proposal.target_item_id,
                update,
            )
            if memory_item is None:
                raise MemoryProposalApplyError("Target memory item was not found")
            return memory_item

        values.setdefault("source_type", "memory_proposal")
        values.setdefault("source_id", proposal.id)
        create = MemoryItemCreate.model_validate(values)
        return story_runtime_store.create_memory_item(project_id, create)
    except ValidationError as exc:
        raise MemoryProposalApplyError("Proposal payload cannot be applied to memory") from exc


def _safe_memory_payload(payload: dict[str, object]) -> dict[str, object]:
    return {key: value for key, value in payload.items() if key in ALLOWED_PROPOSAL_FIELDS}


def _memory_counts(
    memory_items: list[MemoryItemRecord],
    pending_proposals: list[MemoryProposalRecord],
) -> WorkspaceMemoryCounts:
    by_status = {
        "proposed": 0,
        "draft": 0,
        "canon": 0,
        "rejected": 0,
        "outdated": 0,
    }
    for item in memory_items:
        by_status[item.status] += 1
    return WorkspaceMemoryCounts(
        total=len(memory_items),
        proposed=by_status["proposed"],
        draft=by_status["draft"],
        canon=by_status["canon"],
        rejected=by_status["rejected"],
        outdated=by_status["outdated"],
        pending_proposals=len(pending_proposals),
    )


def _next_step(
    *,
    project_id: str,
    read_only: bool,
    active_session: ChapterSessionRecord | None,
    planned_chapter_id: str | None,
    pending_attention: bool,
) -> WorkspaceNextStep:
    if read_only:
        return WorkspaceNextStep(
            code="configure_ai",
            label="Настроить AI",
            detail="Творческие действия заблокированы, пока модель недоступна.",
            href="/settings/providers",
        )
    if active_session and active_session.status in {"preparing", "active", "paused"}:
        return WorkspaceNextStep(
            code="continue_session",
            label="Открыть рассказчика",
            detail="Есть сохраненная сессия главы; можно продолжить интерактивную сцену.",
            href=f"/projects/{project_id}/sessions/{active_session.id}/narrator",
        )
    if active_session and active_session.status == "completed":
        return WorkspaceNextStep(
            code="assemble_draft",
            label="Собрать черновик",
            detail="Сессия завершена; можно превратить лог в markdown-главу.",
            href=f"/projects/{project_id}/sessions/{active_session.id}/draft",
        )
    if active_session and active_session.status == "draft_ready" and active_session.chapter_id:
        return WorkspaceNextStep(
            code="review_chapter",
            label="Провести разбор",
            detail="Черновик собран; следующий шаг - решить, что изменилось в истории.",
            href=f"/projects/{project_id}/chapters/{active_session.chapter_id}/review",
        )
    if active_session and active_session.status == "reviewed" and active_session.chapter_id:
        return WorkspaceNextStep(
            code="forecast_next",
            label="Посмотреть прогноз",
            detail="Глава разобрана; можно выбрать мягкое направление для следующих глав.",
            href=f"/projects/{project_id}/chapters/{active_session.chapter_id}/forecast",
        )
    if planned_chapter_id:
        return WorkspaceNextStep(
            code="prepare_first_chapter",
            label="Подготовить первую главу",
            detail="Стартовая точка уже сохранена, следующий шаг - подготовка рассказчика.",
            href=f"/projects/{project_id}/chapters/{planned_chapter_id}/prepare",
        )
    if pending_attention:
        return WorkspaceNextStep(
            code="review_memory",
            label="Проверить память",
            detail="Есть элементы или предложения, которые ждут решения по канону.",
            href=f"/projects/{project_id}",
        )
    return WorkspaceNextStep(
        code="continue_story",
        label="Продолжить историю",
        detail="Workspace готов к следующему творческому шагу.",
        href=f"/projects/{project_id}/chapters/prepare",
    )


def _workspace_session(sessions: list[ChapterSessionRecord]) -> ChapterSessionRecord | None:
    for status in ["active", "paused", "preparing"]:
        session = next((item for item in sessions if item.status == status), None)
        if session is not None:
            return session
    for status in ["completed", "draft_ready", "reviewed"]:
        session = next((item for item in sessions if item.status == status), None)
        if session is not None:
            return session
    return None
