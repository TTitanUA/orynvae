from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from http import HTTPStatus
import sqlite3

from app.ai import service as ai_service
from app.models.ai_actions import (
    AiActionContext,
    AiActionRequest,
    AiActionResult,
    AiActionStreamEvent,
    AiActionType,
    PrivacyLevel,
)
from app.models.project_ai_settings import (
    ProjectAgentKey,
    ProjectAgentSettingSource,
    ProjectAgentSettings,
    ProjectAiSettingsPatch,
    ProjectAiSettingsResponse,
)
from app.models.projects import ProjectRecord, ProjectUpdate
from app.models.providers import ProviderModelRecord, ProviderRecord
from app.services import project_store, provider_store
from app.services.runtime_status import get_runtime_status
from app.storage.migrations import apply_migrations
from app.storage.paths import get_database_path

AGENT_LABELS: dict[ProjectAgentKey, str] = {
    "start_story_interviewer": "Старт истории",
    "story_line_generator": "Линии истории",
    "chapter_preparer": "Подготовка главы",
    "narrator": "Рассказчик",
    "narrator_action_variants": "Варианты действий",
    "draft_assembler": "Сборка черновика",
    "draft_fragment_editor": "Редактор фрагмента",
    "chapter_reviewer": "Разбор главы",
    "forecaster": "Прогноз",
    "contradiction_checker": "Проверка противоречий",
    "session_summarizer": "Сводка сессии",
}

ACTION_AGENT_KEYS: dict[AiActionType, ProjectAgentKey] = {
    "analyze_synopsis": "start_story_interviewer",
    "extract_story_memory": "start_story_interviewer",
    "suggest_story_lines": "story_line_generator",
    "suggest_start_points": "start_story_interviewer",
    "prepare_chapter_session": "chapter_preparer",
    "narrate_turn": "narrator",
    "suggest_turn_actions": "narrator_action_variants",
    "summarize_session": "session_summarizer",
    "extract_key_events": "chapter_reviewer",
    "assemble_draft": "draft_assembler",
    "edit_markdown_fragment": "draft_fragment_editor",
    "review_chapter": "chapter_reviewer",
    "extract_memory_updates": "chapter_reviewer",
    "update_story_lines": "story_line_generator",
    "forecast_next": "forecaster",
    "check_contradictions": "contradiction_checker",
}


@dataclass(frozen=True)
class AgentPreset:
    temperature: float | None = None
    top_p: float | None = None


AGENT_PRESETS: dict[ProjectAgentKey, AgentPreset] = {
    "start_story_interviewer": AgentPreset(),
    "story_line_generator": AgentPreset(),
    "chapter_preparer": AgentPreset(),
    "narrator": AgentPreset(),
    "narrator_action_variants": AgentPreset(temperature=0.8),
    "draft_assembler": AgentPreset(),
    "draft_fragment_editor": AgentPreset(temperature=0.55),
    "chapter_reviewer": AgentPreset(temperature=0.35),
    "forecaster": AgentPreset(temperature=0.75),
    "contradiction_checker": AgentPreset(temperature=0.2),
    "session_summarizer": AgentPreset(),
}


@dataclass(frozen=True)
class ResolvedProjectGenerationSettings:
    provider_id: str
    model_id: str
    temperature: float
    top_p: float | None
    agent_key: ProjectAgentKey
    temperature_source: ProjectAgentSettingSource
    top_p_source: ProjectAgentSettingSource


class ProjectAiSettingsError(Exception):
    def __init__(
        self,
        message: str,
        *,
        status_code: int = HTTPStatus.UNPROCESSABLE_ENTITY,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _connection() -> sqlite3.Connection:
    apply_migrations()
    connection = sqlite3.connect(get_database_path())
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def get_project_ai_settings(project_id: str) -> ProjectAiSettingsResponse | None:
    project = project_store.get_project(project_id, include_hidden=True)
    if project is None:
        return None

    runtime = get_runtime_status(project_id)
    active_provider = _active_provider(project)
    active_model = _active_model(project, active_provider)
    rows = _agent_rows(project_id)
    warnings = _settings_warnings(project, active_provider, active_model)
    return ProjectAiSettingsResponse(
        project_id=project.id,
        active_provider_id=project.active_provider_id,
        active_model_id=project.active_model_id,
        default_temperature=project.default_temperature,
        default_top_p=project.default_top_p,
        runtime=runtime,
        active_provider=active_provider,
        active_model=active_model,
        agents=[
            _agent_response(project, agent_key, rows.get(agent_key))
            for agent_key in AGENT_LABELS
        ],
        warnings=warnings,
    )


def update_project_ai_settings(
    project_id: str,
    payload: ProjectAiSettingsPatch,
) -> ProjectAiSettingsResponse | None:
    current = project_store.get_project(project_id, include_hidden=True)
    if current is None:
        return None

    values = payload.model_dump(exclude_unset=True)
    provider_id = values.get("active_provider_id", current.active_provider_id)
    model_id = values.get("active_model_id", current.active_model_id)
    provider_id = _clean_optional(provider_id) if isinstance(provider_id, str) else provider_id
    model_id = _clean_optional(model_id) if isinstance(model_id, str) else model_id
    if "active_provider_id" in values and provider_id is None and "active_model_id" not in values:
        model_id = None
    if provider_id is not None:
        provider = _require_usable_provider(provider_id)
        if "active_provider_id" in values and "active_model_id" not in values:
            model_id = provider.default_model_id
        if model_id is not None:
            _require_allowed_model(provider_id, model_id)
    elif model_id is not None:
        raise ProjectAiSettingsError("Select an AI provider before selecting a model")

    project_update = ProjectUpdate(
        active_provider_id=provider_id if "active_provider_id" in values else current.active_provider_id,
        active_model_id=model_id if ("active_provider_id" in values or "active_model_id" in values) else current.active_model_id,
        default_temperature=payload.default_temperature,
        default_top_p=payload.default_top_p,
    )
    project_update_values = project_update.model_dump(exclude_unset=True)
    if not ("active_provider_id" in values or "active_model_id" in values):
        project_update_values.pop("active_provider_id", None)
        project_update_values.pop("active_model_id", None)
    project_update = ProjectUpdate.model_validate(project_update_values)
    project = project_store.update_project(project_id, project_update)
    if project is None:
        return None

    if payload.agents:
        _update_agent_settings(project.id, payload.agents)
        project_store.touch_project(project.id)

    return get_project_ai_settings(project.id)


def resolve_project_generation_settings(
    project_id: str,
    action_type: AiActionType,
) -> ResolvedProjectGenerationSettings:
    project = project_store.get_project(project_id, include_hidden=True)
    if project is None:
        raise ai_service.AiActionException(
            "PROJECT_NOT_FOUND",
            "Project not found",
            status_code=HTTPStatus.NOT_FOUND,
        )
    resolved_provider = ai_service.resolve_action_provider(
        AiActionRequest(action_type=action_type, project_id=project_id)
    )
    agent_key = agent_key_for_action(action_type)
    row = _agent_rows(project_id).get(agent_key)
    temperature_source = _row_source(row, "temperature_source")
    top_p_source = _row_source(row, "top_p_source")
    preset = AGENT_PRESETS[agent_key]
    temperature = _effective_parameter(
        project.default_temperature,
        temperature_source,
        _row_float(row, "temperature_value"),
        preset.temperature,
    )
    top_p = _effective_parameter(
        project.default_top_p,
        top_p_source,
        _row_float(row, "top_p_value"),
        preset.top_p,
    )
    if top_p is not None and not model_supports_parameter(resolved_provider.model, "top_p"):
        top_p = None
    return ResolvedProjectGenerationSettings(
        provider_id=resolved_provider.provider.id,
        model_id=resolved_provider.model.model_id,
        temperature=temperature,
        top_p=top_p,
        agent_key=agent_key,
        temperature_source=temperature_source,
        top_p_source=top_p_source,
    )


def agent_key_for_action(action_type: AiActionType) -> ProjectAgentKey:
    return ACTION_AGENT_KEYS[action_type]


async def execute_project_action(
    *,
    project_id: str,
    action_type: AiActionType,
    input: dict[str, object] | None = None,
    context: AiActionContext | None = None,
    streaming: bool = False,
    privacy_level: PrivacyLevel = "project",
    reasoning_effort: str | None = None,
) -> AiActionResult:
    resolved = resolve_project_generation_settings(project_id, action_type)
    return await ai_service.execute_action(
        AiActionRequest(
            action_type=action_type,
            project_id=project_id,
            provider_id=resolved.provider_id,
            model_id=resolved.model_id,
            input=input or {},
            context=context or AiActionContext(),
            streaming=streaming,
            privacy_level=privacy_level,
            temperature=resolved.temperature,
            top_p=resolved.top_p,
            reasoning_effort=reasoning_effort,
        )
    )


async def stream_project_action_events(
    *,
    project_id: str,
    action_type: AiActionType,
    input: dict[str, object] | None = None,
    context: AiActionContext | None = None,
    privacy_level: PrivacyLevel = "project",
    reasoning_effort: str | None = None,
) -> AsyncIterator[AiActionStreamEvent]:
    try:
        resolved = resolve_project_generation_settings(project_id, action_type)
    except ai_service.AiActionException as exc:
        yield AiActionStreamEvent(event="error", payload=exc.to_detail())
        return
    async for event in ai_service.stream_action_events(
        AiActionRequest(
            action_type=action_type,
            project_id=project_id,
            provider_id=resolved.provider_id,
            model_id=resolved.model_id,
            input=input or {},
            context=context or AiActionContext(),
            streaming=True,
            privacy_level=privacy_level,
            temperature=resolved.temperature,
            top_p=resolved.top_p,
            reasoning_effort=reasoning_effort,
        )
    ):
        yield event


def model_supports_parameter(model: ProviderModelRecord | None, parameter: str) -> bool:
    if model is None:
        return False
    value = model.capabilities.get("supported_parameters")
    if not isinstance(value, list):
        return True
    parameters = [
        item.strip().lower()
        for item in value
        if isinstance(item, str) and item.strip()
    ]
    return not parameters or parameter.lower() in parameters


def _agent_response(
    project: ProjectRecord,
    agent_key: ProjectAgentKey,
    row: sqlite3.Row | None,
) -> ProjectAgentSettings:
    preset = AGENT_PRESETS[agent_key]
    temperature_source = _row_source(row, "temperature_source")
    top_p_source = _row_source(row, "top_p_source")
    temperature_value = _row_float(row, "temperature_value")
    top_p_value = _row_float(row, "top_p_value")
    return ProjectAgentSettings(
        agent_key=agent_key,
        label=AGENT_LABELS[agent_key],
        temperature_source=temperature_source,
        temperature_value=temperature_value,
        effective_temperature=_effective_parameter(
            project.default_temperature,
            temperature_source,
            temperature_value,
            preset.temperature,
        ),
        preset_temperature=preset.temperature,
        top_p_source=top_p_source,
        top_p_value=top_p_value,
        effective_top_p=_effective_parameter(
            project.default_top_p,
            top_p_source,
            top_p_value,
            preset.top_p,
        ),
        preset_top_p=preset.top_p,
    )


def _effective_parameter(
    project_value: float,
    source: ProjectAgentSettingSource,
    custom_value: float | None,
    preset_value: float | None,
) -> float:
    if source == "custom" and custom_value is not None:
        return custom_value
    if source == "agent_default" and preset_value is not None:
        return preset_value
    return project_value


def _agent_rows(project_id: str) -> dict[ProjectAgentKey, sqlite3.Row]:
    with _connection() as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM project_agent_settings
            WHERE project_id = ?
            """,
            (project_id,),
        ).fetchall()
    return {
        row["agent_key"]: row
        for row in rows
        if row["agent_key"] in AGENT_LABELS
    }


def _update_agent_settings(project_id: str, patches) -> None:
    current = _agent_rows(project_id)
    with _connection() as connection:
        for patch in patches:
            existing = current.get(patch.agent_key)
            temperature_source = patch.temperature_source or _row_source(existing, "temperature_source")
            top_p_source = patch.top_p_source or _row_source(existing, "top_p_source")
            temperature_value = _next_value(
                source=temperature_source,
                incoming=patch.temperature_value,
                existing=_row_float(existing, "temperature_value"),
                field_name="temperature_value",
            )
            top_p_value = _next_value(
                source=top_p_source,
                incoming=patch.top_p_value,
                existing=_row_float(existing, "top_p_value"),
                field_name="top_p_value",
            )
            connection.execute(
                """
                INSERT INTO project_agent_settings (
                  project_id,
                  agent_key,
                  temperature_source,
                  temperature_value,
                  top_p_source,
                  top_p_value
                )
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(project_id, agent_key) DO UPDATE SET
                  temperature_source = excluded.temperature_source,
                  temperature_value = excluded.temperature_value,
                  top_p_source = excluded.top_p_source,
                  top_p_value = excluded.top_p_value,
                  updated_at = CURRENT_TIMESTAMP
                """,
                (
                    project_id,
                    patch.agent_key,
                    temperature_source,
                    temperature_value,
                    top_p_source,
                    top_p_value,
                ),
            )
        connection.commit()


def _next_value(
    *,
    source: ProjectAgentSettingSource,
    incoming: float | None,
    existing: float | None,
    field_name: str,
) -> float | None:
    if source != "custom":
        return None
    value = incoming if incoming is not None else existing
    if value is None:
        raise ProjectAiSettingsError(f"{field_name} is required for custom source")
    return value


def _row_source(row: sqlite3.Row | None, column: str) -> ProjectAgentSettingSource:
    if row is None:
        return "agent_default"
    value = row[column]
    return value if value in {"project", "agent_default", "custom"} else "agent_default"


def _row_float(row: sqlite3.Row | None, column: str) -> float | None:
    if row is None or row[column] is None:
        return None
    return float(row[column])


def _active_provider(project: ProjectRecord) -> ProviderRecord | None:
    if project.active_provider_id is None:
        return None
    stored = provider_store.get_provider(project.active_provider_id)
    return stored.provider if stored else None


def _active_model(
    project: ProjectRecord,
    provider: ProviderRecord | None,
) -> ProviderModelRecord | None:
    if provider is None or project.active_model_id is None:
        return None
    return provider_store.get_model(provider.id, project.active_model_id)


def _settings_warnings(
    project: ProjectRecord,
    provider: ProviderRecord | None,
    model: ProviderModelRecord | None,
) -> list[str]:
    warnings: list[str] = []
    if project.active_provider_id and provider is None:
        warnings.append("Выбранный AI-провайдер больше не найден.")
    if provider and not provider.is_enabled:
        warnings.append("Выбранный AI-провайдер отключен.")
    if provider and provider.last_error:
        warnings.append(provider.last_error)
    if project.active_model_id and model is None:
        warnings.append("Выбранная AI-модель больше не найдена.")
    if model and not model.is_allowed:
        warnings.append("Выбранная AI-модель запрещена в настройках провайдера.")
    if model and not model_supports_parameter(model, "top_p"):
        warnings.append("Выбранная модель не объявляет поддержку Top P; параметр не будет отправляться.")
    return warnings


def _require_usable_provider(provider_id: str):
    stored = provider_store.get_provider(provider_id)
    if stored is None:
        raise ProjectAiSettingsError("AI provider not found", status_code=HTTPStatus.NOT_FOUND)
    if not stored.provider.is_enabled:
        raise ProjectAiSettingsError("AI provider is disabled", status_code=HTTPStatus.CONFLICT)
    if stored.provider.last_error:
        raise ProjectAiSettingsError(stored.provider.last_error, status_code=HTTPStatus.CONFLICT)
    return stored.provider


def _require_allowed_model(provider_id: str, model_id: str) -> None:
    model = provider_store.get_model(provider_id, model_id)
    if model is None:
        raise ProjectAiSettingsError("Selected AI model is not known", status_code=HTTPStatus.CONFLICT)
    if not model.is_allowed:
        raise ProjectAiSettingsError("Selected AI model is not allowed", status_code=HTTPStatus.CONFLICT)


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None
