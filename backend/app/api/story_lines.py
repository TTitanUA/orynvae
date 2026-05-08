from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status

from app.ai.service import AiActionException
from app.models.projects import ProjectRecord
from app.models.story_lines import (
    StoryLineCreateRequest,
    StoryLineProgressResponse,
    StoryLineStatusRequest,
    StoryLineSuggestRequest,
    StoryLineSuggestResponse,
    StoryLineUpdateRequest,
)
from app.models.story_runtime import StoryLineRecord, StoryLineStatus, StoryLineType
from app.services import project_store, runtime_status, story_lines as story_lines_service
from app.services import story_runtime_store

router = APIRouter(prefix="/projects/{project_id}/story-lines", tags=["story-lines"])


@router.get("", response_model=list[StoryLineRecord])
def list_story_lines(
    project_id: str,
    type: StoryLineType | None = Query(default=None),
    status: StoryLineStatus | None = Query(default=None),
    search: str | None = Query(default=None, max_length=200),
) -> list[StoryLineRecord]:
    _project_or_404(project_id)
    return story_runtime_store.list_story_lines(
        project_id,
        type=type,
        status=status,
        search=search.strip() if search else None,
    )


@router.post("", response_model=StoryLineRecord, status_code=status.HTTP_201_CREATED)
def create_story_line(
    project_id: str,
    payload: StoryLineCreateRequest,
) -> StoryLineRecord:
    _project_or_404(project_id)
    runtime_status.require_creative_write(project_id)
    line = story_runtime_store.create_story_line(project_id, payload)
    project_store.touch_project(project_id)
    return line


@router.patch("/{line_id}", response_model=StoryLineRecord)
def update_story_line(
    project_id: str,
    line_id: str,
    payload: StoryLineUpdateRequest,
) -> StoryLineRecord:
    _project_or_404(project_id)
    runtime_status.require_creative_write(project_id)
    line = story_runtime_store.update_story_line(project_id, line_id, payload)
    if line is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Story line not found")
    project_store.touch_project(project_id)
    return line


@router.post("/{line_id}/status", response_model=StoryLineRecord)
def update_story_line_status(
    project_id: str,
    line_id: str,
    payload: StoryLineStatusRequest,
) -> StoryLineRecord:
    _project_or_404(project_id)
    runtime_status.require_creative_write(project_id)
    line = story_runtime_store.update_story_line_status(project_id, line_id, payload.status)
    if line is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Story line not found")
    project_store.touch_project(project_id)
    return line


@router.get("/{line_id}/progress", response_model=StoryLineProgressResponse)
def get_story_line_progress(project_id: str, line_id: str) -> StoryLineProgressResponse:
    _project_or_404(project_id)
    line = story_runtime_store.get_story_line(project_id, line_id)
    if line is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Story line not found")
    return StoryLineProgressResponse(
        story_line=line,
        progress=story_runtime_store.list_story_line_progress(project_id, line_id),
    )


@router.post("/suggest", response_model=StoryLineSuggestResponse)
async def suggest_story_lines(
    project_id: str,
    payload: StoryLineSuggestRequest,
) -> StoryLineSuggestResponse:
    project = _project_or_404(project_id)
    runtime_status.require_creative_write(project_id)
    try:
        return await story_lines_service.suggest_story_lines(project, payload)
    except AiActionException as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.to_detail()) from exc


def _project_or_404(project_id: str) -> ProjectRecord:
    project = project_store.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project
