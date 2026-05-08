from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status

from app.ai.service import AiActionException
from app.models.memory import (
    MemoryConflictCheckRequest,
    MemoryConflictCheckResponse,
    MemoryItemCreateRequest,
    MemoryItemStatusRequest,
    MemoryItemUpdateRequest,
    MemoryProposalAcceptRequest,
    MemoryProposalDecisionResponse,
    MemoryProposalRejectRequest,
    ProjectWorkspaceSummary,
)
from app.models.projects import ProjectRecord
from app.models.story_runtime import (
    MemoryItemRecord,
    MemoryItemStatus,
    MemoryItemType,
    MemoryProposalRecord,
    MemoryProposalStatus,
)
from app.services import memory as memory_service
from app.services import project_store, runtime_status, story_runtime_store

router = APIRouter(prefix="/projects/{project_id}", tags=["memory"])


@router.get("/workspace-summary", response_model=ProjectWorkspaceSummary)
def get_workspace_summary(project_id: str) -> ProjectWorkspaceSummary:
    summary = memory_service.get_workspace_summary(project_id)
    if summary is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return summary


@router.get("/memory", response_model=list[MemoryItemRecord])
def list_memory(
    project_id: str,
    type: MemoryItemType | None = Query(default=None),
    status: MemoryItemStatus | None = Query(default=None),
    search: str | None = Query(default=None, max_length=200),
    requires_confirmation: bool | None = Query(default=None),
) -> list[MemoryItemRecord]:
    _project_or_404(project_id)
    return story_runtime_store.list_memory_items(
        project_id,
        type=type,
        status=status,
        search=search.strip() if search else None,
        requires_confirmation=requires_confirmation,
    )


@router.post("/memory", response_model=MemoryItemRecord, status_code=status.HTTP_201_CREATED)
def create_memory_item(
    project_id: str,
    payload: MemoryItemCreateRequest,
) -> MemoryItemRecord:
    _project_or_404(project_id)
    runtime_status.require_creative_write(project_id)
    memory_item = story_runtime_store.create_memory_item(project_id, payload)
    project_store.touch_project(project_id)
    return memory_item


@router.patch("/memory/{item_id}", response_model=MemoryItemRecord)
def update_memory_item(
    project_id: str,
    item_id: str,
    payload: MemoryItemUpdateRequest,
) -> MemoryItemRecord:
    _project_or_404(project_id)
    runtime_status.require_creative_write(project_id)
    memory_item = story_runtime_store.update_memory_item(project_id, item_id, payload)
    if memory_item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Memory item not found")
    project_store.touch_project(project_id)
    return memory_item


@router.post("/memory/{item_id}/status", response_model=MemoryItemRecord)
def update_memory_item_status(
    project_id: str,
    item_id: str,
    payload: MemoryItemStatusRequest,
) -> MemoryItemRecord:
    _project_or_404(project_id)
    runtime_status.require_creative_write(project_id)
    memory_item = story_runtime_store.update_memory_item_status(
        project_id,
        item_id,
        payload.status,
    )
    if memory_item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Memory item not found")
    project_store.touch_project(project_id)
    return memory_item


@router.get("/memory-proposals", response_model=list[MemoryProposalRecord])
def list_memory_proposals(
    project_id: str,
    status: MemoryProposalStatus | None = Query(default=None),
) -> list[MemoryProposalRecord]:
    _project_or_404(project_id)
    return story_runtime_store.list_memory_proposals(project_id, status=status)


@router.post(
    "/memory-proposals/{proposal_id}/accept",
    response_model=MemoryProposalDecisionResponse,
)
def accept_memory_proposal(
    project_id: str,
    proposal_id: str,
    payload: MemoryProposalAcceptRequest,
) -> MemoryProposalDecisionResponse:
    _project_or_404(project_id)
    runtime_status.require_creative_write(project_id)
    try:
        result = memory_service.accept_memory_proposal(project_id, proposal_id, payload)
    except memory_service.MemoryProposalApplyError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Memory proposal not found",
        )
    return result


@router.post("/memory-proposals/{proposal_id}/reject", response_model=MemoryProposalRecord)
def reject_memory_proposal(
    project_id: str,
    proposal_id: str,
    payload: MemoryProposalRejectRequest,
) -> MemoryProposalRecord:
    _project_or_404(project_id)
    runtime_status.require_creative_write(project_id)
    proposal = memory_service.reject_memory_proposal(project_id, proposal_id, payload)
    if proposal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Memory proposal not found",
        )
    return proposal


@router.post("/memory/check-conflicts", response_model=MemoryConflictCheckResponse)
async def check_memory_conflicts(
    project_id: str,
    payload: MemoryConflictCheckRequest,
) -> MemoryConflictCheckResponse:
    project = _project_or_404(project_id)
    runtime_status.require_creative_write(project_id)
    try:
        return await memory_service.check_memory_conflicts(project, payload)
    except AiActionException as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.to_detail()) from exc


def _project_or_404(project_id: str) -> ProjectRecord:
    project = project_store.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project
