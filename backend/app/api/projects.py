from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.ai.service import AiActionException
from app.models.projects import ProjectCreate, ProjectRecord, ProjectUpdate
from app.models.start_story import (
    StartStoryAnalysisResponse,
    StartStoryAnalyzeRequest,
    StartStoryConfirmRequest,
    StartStoryConfirmResponse,
    StartStoryRefineRequest,
)
from app.services import project_store, start_story
from app.services.runtime_status import require_creative_write

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectRecord])
def list_projects() -> list[ProjectRecord]:
    return project_store.list_projects()


@router.post("", response_model=ProjectRecord, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    _: None = Depends(require_creative_write),
) -> ProjectRecord:
    return project_store.create_project(payload)


@router.post("/start/analyze", response_model=StartStoryAnalysisResponse)
async def analyze_start_story(payload: StartStoryAnalyzeRequest) -> StartStoryAnalysisResponse:
    try:
        return await start_story.analyze_start_story(payload)
    except AiActionException as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.to_detail()) from exc


@router.post("/start/refine", response_model=StartStoryAnalysisResponse)
async def refine_start_story(payload: StartStoryRefineRequest) -> StartStoryAnalysisResponse:
    try:
        return await start_story.refine_start_story(payload)
    except AiActionException as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.to_detail()) from exc


@router.post(
    "/start/confirm",
    response_model=StartStoryConfirmResponse,
    status_code=status.HTTP_201_CREATED,
)
def confirm_start_story(payload: StartStoryConfirmRequest) -> StartStoryConfirmResponse:
    try:
        return start_story.confirm_start_story(payload)
    except AiActionException as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.to_detail()) from exc


@router.get("/{project_id}", response_model=ProjectRecord)
def get_project(project_id: str) -> ProjectRecord:
    project = project_store.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.patch("/{project_id}", response_model=ProjectRecord)
def update_project(
    project_id: str,
    payload: ProjectUpdate,
    _: None = Depends(require_creative_write),
) -> ProjectRecord:
    project = project_store.update_project(project_id, payload)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def archive_project(
    project_id: str,
    _: None = Depends(require_creative_write),
) -> Response:
    if not project_store.archive_project(project_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{project_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
def archive_project_v2(
    project_id: str,
    _: None = Depends(require_creative_write),
) -> Response:
    if not project_store.archive_project(project_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
