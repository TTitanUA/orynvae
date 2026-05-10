from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.ai.service import AiActionException
from app.models.projects import ProjectCreate, ProjectRecord, ProjectUpdate
from app.models.project_ai_settings import ProjectAiSettingsPatch, ProjectAiSettingsResponse
from app.models.stage7 import ForecastGenerateRequest, ForecastListResponse
from app.models.story_runtime import ForecastRecord
from app.models.start_story import (
    StartStoryAnalysisResponse,
    StartStoryAnalyzeRequest,
    StartStoryConfirmRequest,
    StartStoryConfirmResponse,
    StartStoryRefineRequest,
)
from app.services import project_ai_settings, project_store, stage7, start_story
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


@router.get("/{project_id}/forecasts", response_model=ForecastListResponse)
def list_forecasts(project_id: str) -> ForecastListResponse:
    forecasts = stage7.list_forecasts(project_id)
    if forecasts is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return ForecastListResponse(forecasts=forecasts)


@router.get("/{project_id}/ai-settings", response_model=ProjectAiSettingsResponse)
def get_project_ai_settings(project_id: str) -> ProjectAiSettingsResponse:
    settings = project_ai_settings.get_project_ai_settings(project_id)
    if settings is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return settings


@router.patch("/{project_id}/ai-settings", response_model=ProjectAiSettingsResponse)
def update_project_ai_settings(
    project_id: str,
    payload: ProjectAiSettingsPatch,
) -> ProjectAiSettingsResponse:
    try:
        settings = project_ai_settings.update_project_ai_settings(project_id, payload)
    except project_ai_settings.ProjectAiSettingsError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    if settings is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return settings


@router.post("/{project_id}/forecast", response_model=ForecastRecord)
async def generate_forecast(
    project_id: str,
    payload: ForecastGenerateRequest,
) -> ForecastRecord:
    try:
        forecast = await stage7.generate_forecast(project_id, payload)
    except stage7.Stage7Error as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    except AiActionException as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.to_detail()) from exc
    if forecast is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project or chapter not found")
    return forecast


@router.get("/{project_id}/forecasts/{forecast_id}", response_model=ForecastRecord)
def get_forecast(project_id: str, forecast_id: str) -> ForecastRecord:
    forecast = stage7.get_forecast(project_id, forecast_id)
    if forecast is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Forecast not found")
    return forecast


@router.post(
    "/{project_id}/forecasts/{forecast_id}/options/{option_id}/select",
    response_model=ForecastRecord,
)
def select_forecast_option(
    project_id: str,
    forecast_id: str,
    option_id: str,
) -> ForecastRecord:
    forecast = stage7.select_forecast_option(project_id, forecast_id, option_id)
    if forecast is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Forecast option not found")
    return forecast


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
