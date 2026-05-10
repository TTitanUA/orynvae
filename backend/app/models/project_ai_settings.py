from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.providers import ProviderModelRecord, ProviderRecord
from app.models.runtime import RuntimeStatus

ProjectAgentKey = Literal[
    "start_story_interviewer",
    "story_line_generator",
    "chapter_preparer",
    "narrator",
    "narrator_action_variants",
    "draft_assembler",
    "draft_fragment_editor",
    "chapter_reviewer",
    "forecaster",
    "contradiction_checker",
    "session_summarizer",
]
ProjectAgentSettingSource = Literal["project", "agent_default", "custom"]


class ProjectAiSettingsApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ProjectAgentSettings(ProjectAiSettingsApiModel):
    agent_key: ProjectAgentKey
    label: str
    temperature_source: ProjectAgentSettingSource
    temperature_value: float | None = Field(default=None, ge=0, le=2)
    effective_temperature: float = Field(ge=0, le=2)
    preset_temperature: float | None = Field(default=None, ge=0, le=2)
    top_p_source: ProjectAgentSettingSource
    top_p_value: float | None = Field(default=None, ge=0, le=1)
    effective_top_p: float | None = Field(default=None, ge=0, le=1)
    preset_top_p: float | None = Field(default=None, ge=0, le=1)


class ProjectAiSettingsResponse(ProjectAiSettingsApiModel):
    project_id: str
    active_provider_id: str | None = None
    active_model_id: str | None = None
    default_temperature: float = Field(ge=0, le=2)
    default_top_p: float = Field(ge=0, le=1)
    runtime: RuntimeStatus
    active_provider: ProviderRecord | None = None
    active_model: ProviderModelRecord | None = None
    agents: list[ProjectAgentSettings] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ProjectAgentSettingsPatch(ProjectAiSettingsApiModel):
    agent_key: ProjectAgentKey
    temperature_source: ProjectAgentSettingSource | None = None
    temperature_value: float | None = Field(default=None, ge=0, le=2)
    top_p_source: ProjectAgentSettingSource | None = None
    top_p_value: float | None = Field(default=None, ge=0, le=1)


class ProjectAiSettingsPatch(ProjectAiSettingsApiModel):
    active_provider_id: str | None = None
    active_model_id: str | None = None
    default_temperature: float | None = Field(default=None, ge=0, le=2)
    default_top_p: float | None = Field(default=None, ge=0, le=1)
    agents: list[ProjectAgentSettingsPatch] = Field(default_factory=list)

    @model_validator(mode="after")
    def _requires_change(self) -> ProjectAiSettingsPatch:
        if not self.model_dump(exclude_unset=True):
            raise ValueError("Provide at least one AI setting")
        return self
