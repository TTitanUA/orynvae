from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.ai.service import AiActionException
from app.models.chapters import (
    ChapterCreateRequest,
    ChapterPrepareRequest,
    ChapterPrepareResponse,
    ChapterUpdateRequest,
)
from app.models.projects import ProjectRecord
from app.models.stage7 import (
    ChapterReviewApplyRequest,
    ChapterReviewGenerateRequest,
    ChapterReviewResponse,
    DraftAssistRequest,
    DraftAssistResponse,
    DraftUpdateRequest,
    DraftUpdateResponse,
)
from app.models.story_runtime import ChapterRecord, DraftVersionRecord
from app.services import chapters as chapters_service
from app.services import memory as memory_service
from app.services import project_store, runtime_status, stage7, story_runtime_store

router = APIRouter(prefix="/projects/{project_id}/chapters", tags=["chapters"])


@router.get("", response_model=list[ChapterRecord])
def list_chapters(project_id: str) -> list[ChapterRecord]:
    _project_or_404(project_id)
    return story_runtime_store.list_chapters(project_id)


@router.post("", response_model=ChapterRecord, status_code=status.HTTP_201_CREATED)
def create_chapter(project_id: str, payload: ChapterCreateRequest) -> ChapterRecord:
    _project_or_404(project_id)
    runtime_status.require_creative_write(project_id)
    return chapters_service.create_chapter(project_id, payload)


@router.get("/{chapter_id}", response_model=ChapterRecord)
def get_chapter(project_id: str, chapter_id: str) -> ChapterRecord:
    _project_or_404(project_id)
    chapter = story_runtime_store.get_chapter(project_id, chapter_id)
    if chapter is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chapter not found")
    return chapter


@router.get("/{chapter_id}/draft-versions", response_model=list[DraftVersionRecord])
def list_draft_versions(project_id: str, chapter_id: str) -> list[DraftVersionRecord]:
    _project_or_404(project_id)
    drafts = stage7.list_draft_versions(project_id, chapter_id)
    if drafts is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chapter not found")
    return drafts


@router.patch("/{chapter_id}/draft", response_model=DraftUpdateResponse)
def update_chapter_draft(
    project_id: str,
    chapter_id: str,
    payload: DraftUpdateRequest,
) -> DraftUpdateResponse:
    _project_or_404(project_id)
    result = stage7.update_draft(project_id, chapter_id, payload)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chapter not found")
    return result


@router.post("/{chapter_id}/draft/assist", response_model=DraftAssistResponse)
async def assist_chapter_draft(
    project_id: str,
    chapter_id: str,
    payload: DraftAssistRequest,
) -> DraftAssistResponse:
    _project_or_404(project_id)
    try:
        result = await stage7.assist_draft(project_id, chapter_id, payload)
    except stage7.Stage7Error as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    except AiActionException as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.to_detail()) from exc
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chapter not found")
    return result


@router.get("/{chapter_id}/review", response_model=ChapterReviewResponse)
def get_chapter_review(project_id: str, chapter_id: str) -> ChapterReviewResponse:
    _project_or_404(project_id)
    result = stage7.get_review(project_id, chapter_id)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chapter review not found")
    return result


@router.post("/{chapter_id}/review", response_model=ChapterReviewResponse)
async def generate_chapter_review(
    project_id: str,
    chapter_id: str,
    payload: ChapterReviewGenerateRequest,
) -> ChapterReviewResponse:
    _project_or_404(project_id)
    try:
        result = await stage7.generate_review(project_id, chapter_id, payload)
    except stage7.Stage7Error as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    except AiActionException as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.to_detail()) from exc
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chapter not found")
    return result


@router.post("/{chapter_id}/review/apply", response_model=ChapterReviewResponse)
def apply_chapter_review(
    project_id: str,
    chapter_id: str,
    payload: ChapterReviewApplyRequest,
) -> ChapterReviewResponse:
    _project_or_404(project_id)
    try:
        result = stage7.apply_review_decisions(project_id, chapter_id, payload)
    except stage7.Stage7Error as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    except memory_service.MemoryProposalApplyError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chapter review not found")
    return result


@router.patch("/{chapter_id}", response_model=ChapterRecord)
def update_chapter(
    project_id: str,
    chapter_id: str,
    payload: ChapterUpdateRequest,
) -> ChapterRecord:
    _project_or_404(project_id)
    runtime_status.require_creative_write(project_id)
    chapter = chapters_service.update_chapter(project_id, chapter_id, payload)
    if chapter is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chapter not found")
    return chapter


@router.post("/{chapter_id}/session/prepare", response_model=ChapterPrepareResponse)
async def prepare_chapter_session(
    project_id: str,
    chapter_id: str,
    payload: ChapterPrepareRequest,
) -> ChapterPrepareResponse:
    project = _project_or_404(project_id)
    runtime_status.require_creative_write(project_id)
    try:
        result = await chapters_service.prepare_chapter_session(project, chapter_id, payload)
    except chapters_service.ChapterPreparationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except AiActionException as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.to_detail()) from exc
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chapter not found")
    return result


def _project_or_404(project_id: str) -> ProjectRecord:
    project = project_store.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project
