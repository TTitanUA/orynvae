from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.ai_actions import AiSuggestedAction, ReasoningEffort
from app.models.story_runtime import (
    ChapterRecord,
    ChapterSessionRecord,
    ChapterStatus,
    SessionTurnRecord,
)

ChapterUserRole = Literal["single_character", "multiple_characters", "author", "unknown"]
ChapterPace = Literal["slow", "medium", "fast", "user_choice"]


class ChapterApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ChapterCreateRequest(ChapterApiModel):
    title: str | None = Field(default=None, max_length=180)
    order_index: int | None = None
    synopsis: str | None = None


class ChapterUpdateRequest(ChapterApiModel):
    title: str | None = Field(default=None, min_length=1, max_length=180)
    order_index: int | None = None
    status: ChapterStatus | None = None
    synopsis: str | None = None


class ChapterPrepareRequest(ChapterApiModel):
    title: str | None = Field(default=None, max_length=180)
    focus: str | None = Field(default=None, max_length=2000)
    user_role: ChapterUserRole = "unknown"
    controlled_character_ids: list[str] = Field(default_factory=list)
    primary_story_line_id: str | None = None
    secondary_story_line_ids: list[str] = Field(default_factory=list)
    ignored_story_line_ids: list[str] = Field(default_factory=list)
    tone: str | None = Field(default=None, max_length=80)
    pace: ChapterPace | None = None
    expansion_policy_override: str | None = Field(default=None, max_length=80)
    start_point: str | None = Field(default=None, max_length=4000)
    provider_id: str | None = None
    model_id: str | None = None
    temperature: float = Field(default=0.7, ge=0, le=2)
    top_p: float | None = Field(default=None, ge=0, le=1)
    reasoning_effort: ReasoningEffort | None = None

    @model_validator(mode="after")
    def _validate_line_focus(self) -> ChapterPrepareRequest:
        if len(self.secondary_story_line_ids) > 2:
            raise ValueError("Choose at most two secondary story lines")
        selected = [
            item
            for item in [self.primary_story_line_id, *self.secondary_story_line_ids]
            if item is not None
        ]
        if len(selected) != len(set(selected)):
            raise ValueError("Story line focus contains duplicates")
        ignored = set(self.ignored_story_line_ids)
        if ignored.intersection(selected):
            raise ValueError("Ignored story lines cannot also be active")
        return self


class ChapterPrepareResponse(ChapterApiModel):
    chapter: ChapterRecord
    session: ChapterSessionRecord
    opening_turn: SessionTurnRecord | None = None
    narrator_opening: str
    suggested_actions: list[AiSuggestedAction] = Field(default_factory=list)
    relevant_memory_titles: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    chapter_intention: str | None = None
    start_situation: str | None = None
    participant_titles: list[str] = Field(default_factory=list)
    possible_line_movements: list[str] = Field(default_factory=list)
    coherence_risks: list[str] = Field(default_factory=list)
