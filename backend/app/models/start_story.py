from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.projects import ProjectRecord
from app.models.ai_actions import ReasoningEffort
from app.models.story_runtime import (
    ChapterRecord,
    MemoryItemRecord,
    MemoryItemStatus,
    MemoryItemType,
    StoryLineRecord,
    StoryLineStatus,
    StoryLineType,
)

ExpansionPolicy = Literal["draft", "ask", "request", "mixed"]


class StartStoryBaseModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class StartStoryAnalyzeRequest(StartStoryBaseModel):
    synopsis: str = Field(min_length=1, max_length=8000)
    title: str | None = Field(default=None, max_length=160)
    tone: str | None = Field(default=None, max_length=500)
    avoid: str | None = Field(default=None, max_length=1000)
    preferred_user_role: str | None = Field(default=None, max_length=120)
    provider_id: str | None = None
    model_id: str | None = None
    temperature: float = Field(default=0.7, ge=0, le=2)
    top_p: float | None = Field(default=None, ge=0, le=1)
    reasoning_effort: ReasoningEffort | None = None

    @field_validator("synopsis", mode="before")
    @classmethod
    def _strip_synopsis(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("title", "tone", "avoid", "preferred_user_role", "provider_id", "model_id", mode="before")
    @classmethod
    def _clean_optional_text(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        stripped = value.strip()
        return stripped or None


class StartStoryQuestion(StartStoryBaseModel):
    question: str = Field(min_length=1)
    why: str | None = None


class StartStoryMemoryCandidate(StartStoryBaseModel):
    type: MemoryItemType
    title: str = Field(min_length=1, max_length=180)
    summary: str | None = None
    body: str | None = None
    status: MemoryItemStatus = "proposed"
    importance: int = 0
    reason: str | None = None


class StartStoryLineCandidate(StartStoryBaseModel):
    type: StoryLineType
    title: str = Field(min_length=1, max_length=180)
    description: str | None = None
    current_state: str | None = None
    status: StoryLineStatus = "proposed"
    priority: int = 0
    reason: str | None = None


class StartStoryPointCandidate(StartStoryBaseModel):
    title: str = Field(min_length=1, max_length=180)
    situation: str = Field(min_length=1)
    present_character_titles: list[str] = Field(default_factory=list)
    tension: str | None = None
    user_role_hint: str | None = None


class StartStoryAnalysisResponse(StartStoryBaseModel):
    source_synopsis: str
    title: str | None = None
    tone: str | None = None
    avoid: str | None = None
    preferred_user_role: str | None = None
    provider_id: str
    model_id: str
    provider_name: str
    provider_is_external: bool
    understood_synopsis: str
    emotional_core: str | None = None
    suggested_title: str | None = None
    questions: list[StartStoryQuestion] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    memory_items: list[StartStoryMemoryCandidate] = Field(default_factory=list)
    story_lines: list[StartStoryLineCandidate] = Field(default_factory=list)
    start_points: list[StartStoryPointCandidate] = Field(default_factory=list)


class StartStoryRefineRequest(StartStoryBaseModel):
    source_synopsis: str = Field(min_length=1, max_length=8000)
    title: str | None = Field(default=None, max_length=160)
    tone: str | None = Field(default=None, max_length=500)
    avoid: str | None = Field(default=None, max_length=1000)
    preferred_user_role: str | None = Field(default=None, max_length=120)
    provider_id: str | None = None
    model_id: str | None = None
    temperature: float = Field(default=0.7, ge=0, le=2)
    top_p: float | None = Field(default=None, ge=0, le=1)
    reasoning_effort: ReasoningEffort | None = None
    feedback: str = Field(min_length=1, max_length=4000)
    current_project_title: str | None = Field(default=None, max_length=160)
    current_understood_synopsis: str | None = Field(default=None, max_length=8000)
    current_emotional_core: str | None = Field(default=None, max_length=2000)
    current_questions: list[StartStoryQuestion] = Field(default_factory=list)
    current_memory_items: list[StartStoryMemoryCandidate] = Field(default_factory=list)
    current_story_lines: list[StartStoryLineCandidate] = Field(default_factory=list)
    current_start_points: list[StartStoryPointCandidate] = Field(default_factory=list)

    @field_validator("source_synopsis", "feedback", mode="before")
    @classmethod
    def _strip_required_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator(
        "title",
        "tone",
        "avoid",
        "preferred_user_role",
        "provider_id",
        "model_id",
        "current_project_title",
        "current_understood_synopsis",
        "current_emotional_core",
        mode="before",
    )
    @classmethod
    def _clean_optional_text(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        stripped = value.strip()
        return stripped or None


class StartStoryConfirmRequest(StartStoryBaseModel):
    source_synopsis: str = Field(min_length=1, max_length=8000)
    project_title: str = Field(min_length=1, max_length=160)
    understood_synopsis: str | None = Field(default=None, max_length=8000)
    provider_id: str | None = None
    model_id: str | None = None
    expansion_policy: ExpansionPolicy = "ask"
    memory_items: list[StartStoryMemoryCandidate] = Field(default_factory=list)
    story_lines: list[StartStoryLineCandidate] = Field(default_factory=list)
    selected_start_point: StartStoryPointCandidate | None = None
    skip_start_point: bool = False

    @field_validator("source_synopsis", "project_title", mode="before")
    @classmethod
    def _strip_required_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("understood_synopsis", "provider_id", "model_id", mode="before")
    @classmethod
    def _clean_optional_text(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        stripped = value.strip()
        return stripped or None

    @model_validator(mode="after")
    def _requires_start_point_decision(self) -> StartStoryConfirmRequest:
        if self.selected_start_point is None and not self.skip_start_point:
            raise ValueError("Select a start point or explicitly skip it")
        return self


class StartStoryConfirmResponse(StartStoryBaseModel):
    project: ProjectRecord
    created_memory_items: list[MemoryItemRecord] = Field(default_factory=list)
    created_story_lines: list[StoryLineRecord] = Field(default_factory=list)
    initial_chapter: ChapterRecord | None = None
    start_points: list[StartStoryPointCandidate] = Field(default_factory=list)
