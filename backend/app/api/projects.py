from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException, Response, status

from app.models.projects import (
    ProjectCreate,
    ProjectRecord,
    ProjectSetupAnalysis,
    ProjectSetupAnalysisRequest,
    ProjectSetupCreate,
    ProjectUpdate,
)
from app.models.providers import ChatMessage
from app.providers.adapters import create_adapter
from app.services import project_store, provider_store

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectRecord])
def list_projects() -> list[ProjectRecord]:
    return project_store.list_projects()


@router.post("", response_model=ProjectRecord, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate) -> ProjectRecord:
    _validate_provider_selection(payload.provider_id, payload.model_id)
    return project_store.create_project(payload)


@router.get("/{project_id}", response_model=ProjectRecord)
def get_project(project_id: str) -> ProjectRecord:
    project = project_store.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.patch("/{project_id}", response_model=ProjectRecord)
def update_project(project_id: str, payload: ProjectUpdate) -> ProjectRecord:
    _validate_provider_selection(payload.provider_id, payload.model_id)
    project = project_store.update_project(project_id, payload)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def archive_project(project_id: str) -> Response:
    if not project_store.archive_project(project_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/setup", response_model=ProjectRecord, status_code=status.HTTP_201_CREATED)
def create_project_from_setup(payload: ProjectSetupCreate) -> ProjectRecord:
    _validate_provider_selection(payload.provider_id, payload.model_id)
    return project_store.create_project_from_setup(payload)


@router.post("/setup/analyze", response_model=ProjectSetupAnalysis)
async def analyze_project_setup(payload: ProjectSetupAnalysisRequest) -> ProjectSetupAnalysis:
    if not payload.provider_id or not payload.model_id:
        analysis = _fallback_analysis(payload.idea_text)
        analysis.warnings.append("AI-провайдер или модель не выбраны, создана локальная заготовка.")
        return analysis

    stored = provider_store.get_provider(payload.provider_id)
    if stored is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")

    adapter = create_adapter(stored.provider, stored.api_key)
    try:
        raw = await adapter.complete_chat(
            model_id=payload.model_id,
            temperature=0.35,
            messages=[
                ChatMessage(
                    role="system",
                    content=(
                        "You are an editorial project setup assistant. "
                        "Return only compact valid JSON with keys: title, description, "
                        "synopsis, genre, tone, setting, format, central_conflict, "
                        "themes, directions, target_length, point_of_view."
                    ),
                ),
                ChatMessage(
                    role="user",
                    content=(
                        "Analyze this story idea and produce an editable project setup. "
                        "Use Russian if the idea is Russian, otherwise use the same language "
                        f"as the idea.\n\n{payload.idea_text}"
                    ),
                ),
            ],
        )
    except Exception as exc:
        analysis = _fallback_analysis(payload.idea_text)
        analysis.warnings.append(f"AI-анализ недоступен: {exc.__class__.__name__}")
        return analysis

    analysis = _analysis_from_ai_text(raw, payload.idea_text)
    analysis.raw_text = raw
    return analysis


def _validate_provider_selection(provider_id: str | None, model_id: str | None) -> None:
    if not provider_id and not model_id:
        return
    if not provider_id or not model_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provider and model must be selected together",
        )
    if provider_store.get_provider(provider_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")


def _analysis_from_ai_text(raw_text: str, idea_text: str) -> ProjectSetupAnalysis:
    parsed = _parse_json_object(raw_text)
    if parsed is None:
        analysis = _fallback_analysis(idea_text)
        analysis.synopsis = raw_text.strip() or analysis.synopsis
        analysis.warnings.append("AI вернул неструктурированный ответ, текст помещен в синопсис.")
        return analysis

    fallback = _fallback_analysis(idea_text)
    return ProjectSetupAnalysis(
        title=_string(parsed.get("title")) or fallback.title,
        description=_string(parsed.get("description")) or fallback.description,
        synopsis=_string(parsed.get("synopsis")) or fallback.synopsis,
        genre=_string(parsed.get("genre")) or fallback.genre,
        tone=_string(parsed.get("tone")) or fallback.tone,
        setting=_string(parsed.get("setting")) or fallback.setting,
        format=_string(parsed.get("format")) or fallback.format,
        central_conflict=_string(parsed.get("central_conflict")) or fallback.central_conflict,
        themes=_string_list(parsed.get("themes")) or fallback.themes,
        directions=_string_list(parsed.get("directions")) or fallback.directions,
        target_length=_string(parsed.get("target_length")) or fallback.target_length,
        point_of_view=_string(parsed.get("point_of_view")) or fallback.point_of_view,
    )


def _fallback_analysis(idea_text: str) -> ProjectSetupAnalysis:
    clean = " ".join(idea_text.split())
    words = clean.split()
    title = " ".join(words[:6]).strip(".,:;!?") or "Новый проект"
    description = clean[:220] + ("..." if len(clean) > 220 else "")
    synopsis = clean if len(clean) < 900 else clean[:897] + "..."
    return ProjectSetupAnalysis(
        title=title,
        description=description,
        synopsis=synopsis,
        genre="Не определен",
        tone="Авторский",
        setting="Будет уточнен",
        format="Новелла",
        central_conflict="Главный конфликт будет уточнен в рабочем пространстве проекта.",
        themes=[],
        directions=[
            "Развить идею через персонажа с самой сильной внутренней ставкой.",
            "Сначала определить правила мира и цену ключевого выбора.",
            "Построить стартовую арку вокруг события, которое меняет статус-кво.",
        ],
        target_length="MVP-проект",
        point_of_view="Будет уточнена",
    )


def _parse_json_object(text: str) -> dict[str, Any] | None:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        if stripped.lower().startswith("json"):
            stripped = stripped[4:].strip()
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        parsed = json.loads(stripped[start : end + 1])
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _string(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]

