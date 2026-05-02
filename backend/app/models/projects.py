from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ProjectSettingsRecord(BaseModel):
    genre: str | None = None
    tone: str | None = None
    setting: str | None = None
    format: str | None = None
    live_mode_recommended: bool = False
    settings: dict[str, Any] = Field(default_factory=dict)


class ProjectRecord(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str | None
    synopsis: str | None
    provider_id: str | None
    model_id: str | None
    status: str
    created_at: str
    updated_at: str
    archived_at: str | None
    settings: ProjectSettingsRecord | None = None


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1200)
    synopsis: str | None = Field(default=None, max_length=5000)
    provider_id: str | None = None
    model_id: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1200)
    synopsis: str | None = Field(default=None, max_length=5000)
    provider_id: str | None = None
    model_id: str | None = None
    status: str | None = Field(default=None, max_length=40)


class ProjectSetupAnalysisRequest(BaseModel):
    idea_text: str = Field(min_length=1, max_length=12000)
    provider_id: str | None = None
    model_id: str | None = None


class ProjectSetupAnalysis(BaseModel):
    title: str
    description: str
    synopsis: str
    genre: str
    tone: str
    setting: str
    format: str
    central_conflict: str
    themes: list[str] = Field(default_factory=list)
    directions: list[str] = Field(default_factory=list)
    target_length: str | None = None
    point_of_view: str | None = None
    raw_text: str | None = None
    warnings: list[str] = Field(default_factory=list)


class ProjectSetupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    idea_text: str = Field(min_length=1, max_length=12000)
    description: str | None = Field(default=None, max_length=1200)
    synopsis: str | None = Field(default=None, max_length=5000)
    genre: str | None = Field(default=None, max_length=120)
    tone: str | None = Field(default=None, max_length=120)
    setting: str | None = Field(default=None, max_length=240)
    format: str | None = Field(default=None, max_length=120)
    central_conflict: str | None = Field(default=None, max_length=600)
    themes: list[str] = Field(default_factory=list)
    directions: list[str] = Field(default_factory=list)
    selected_direction: str | None = Field(default=None, max_length=1200)
    target_length: str | None = Field(default=None, max_length=120)
    point_of_view: str | None = Field(default=None, max_length=120)
    provider_id: str | None = None
    model_id: str | None = None

