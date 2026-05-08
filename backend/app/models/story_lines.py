from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.ai_actions import ReasoningEffort
from app.models.story_runtime import (
    StoryLineCreate,
    StoryLineProgressRecord,
    StoryLineRecord,
    StoryLineStatus,
    StoryLineType,
    StoryLineUpdate,
)


class StoryLineApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class StoryLineCreateRequest(StoryLineCreate):
    model_config = ConfigDict(extra="forbid")


class StoryLineUpdateRequest(StoryLineUpdate):
    model_config = ConfigDict(extra="forbid")


class StoryLineStatusRequest(StoryLineApiModel):
    status: StoryLineStatus


class StoryLineSuggestRequest(StoryLineApiModel):
    instructions: str | None = Field(default=None, max_length=4000)
    max_suggestions: int = Field(default=5, ge=1, le=7)
    provider_id: str | None = None
    model_id: str | None = None
    temperature: float = Field(default=0.7, ge=0, le=2)
    top_p: float | None = Field(default=None, ge=0, le=1)
    reasoning_effort: ReasoningEffort | None = None

    @field_validator("instructions", "provider_id", "model_id", mode="before")
    @classmethod
    def _clean_optional_text(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        stripped = value.strip()
        return stripped or None


class StoryLineSuggestion(StoryLineApiModel):
    type: StoryLineType
    title: str = Field(min_length=1, max_length=180)
    description: str | None = None
    current_state: str | None = None
    priority: int = 0
    reason: str | None = None


class StoryLineSuggestResponse(StoryLineApiModel):
    story_lines: list[StoryLineSuggestion] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class StoryLineProgressResponse(StoryLineApiModel):
    story_line: StoryLineRecord
    progress: list[StoryLineProgressRecord] = Field(default_factory=list)
