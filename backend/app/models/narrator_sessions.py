from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.ai_actions import AiStoryLineUpdateCandidate, ReasoningEffort
from app.models.projects import ProjectRecord
from app.models.story_runtime import (
    ChapterRecord,
    ChapterSessionRecord,
    KeyEventRecord,
    MemoryProposalRecord,
    SessionSuggestedActionRecord,
    SessionTurnRecord,
)

NarratorInputType = Literal["action", "dialogue", "author_command", "choice", "note"]


class NarratorSessionApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class NarratorSessionDetail(NarratorSessionApiModel):
    project: ProjectRecord
    chapter: ChapterRecord | None = None
    session: ChapterSessionRecord
    turns: list[SessionTurnRecord] = Field(default_factory=list)
    suggested_actions: list[SessionSuggestedActionRecord] = Field(default_factory=list)
    key_events: list[KeyEventRecord] = Field(default_factory=list)
    memory_proposals: list[MemoryProposalRecord] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class NarratorTurnRequest(NarratorSessionApiModel):
    input_type: NarratorInputType = "action"
    content: str | None = Field(default=None, max_length=8000)
    selected_option_id: str | None = None
    provider_id: str | None = None
    model_id: str | None = None
    temperature: float | None = Field(default=None, ge=0, le=2)
    top_p: float | None = Field(default=None, ge=0, le=1)
    reasoning_effort: ReasoningEffort | None = None

    @model_validator(mode="after")
    def _requires_input(self) -> NarratorTurnRequest:
        if not (self.content and self.content.strip()) and not self.selected_option_id:
            raise ValueError("Provide content or selected_option_id")
        return self


class NarratorAgentSettingsRequest(NarratorSessionApiModel):
    agent_instructions: str | None = Field(default=None, max_length=4000)
    agent_temperature: float | None = Field(default=None, ge=0, le=2)
    agent_top_p: float | None = Field(default=None, ge=0, le=1)
    agent_reasoning_effort: ReasoningEffort | None = None

    @model_validator(mode="after")
    def _requires_change(self) -> NarratorAgentSettingsRequest:
        if not self.model_dump(exclude_unset=True):
            raise ValueError("Provide at least one agent setting")
        return self


class NarratorRegenerateRequest(NarratorSessionApiModel):
    comment: str | None = Field(default=None, max_length=2000)


class NarratorSuggestedActionsRegenerateRequest(NarratorSessionApiModel):
    source_turn_id: str | None = None
    prompt: str | None = Field(default=None, max_length=4000)
    comment: str | None = Field(default=None, max_length=2000)
    provider_id: str | None = None
    model_id: str | None = None
    temperature: float | None = Field(default=None, ge=0, le=2)
    top_p: float | None = Field(default=None, ge=0, le=1)
    reasoning_effort: ReasoningEffort | None = None


class NarratorRollbackRequest(NarratorSessionApiModel):
    target_turn_id: str
    user_turn_mode: Literal["keep", "redo"] = "keep"
    comment: str | None = Field(default=None, max_length=2000)


class NarratorTurnFlagUpdateRequest(NarratorSessionApiModel):
    is_key_event: bool | None = None
    exclude_from_draft: bool | None = None

    @model_validator(mode="after")
    def _requires_change(self) -> NarratorTurnFlagUpdateRequest:
        if self.is_key_event is None and self.exclude_from_draft is None:
            raise ValueError("Provide at least one turn flag")
        return self


class NarratorKeyEventUpdateRequest(NarratorSessionApiModel):
    title: str | None = Field(default=None, min_length=1, max_length=180)
    summary: str | None = None
    consequences: str | None = None
    related_memory_item_ids: list[str] | None = None
    related_story_line_ids: list[str] | None = None
    include_in_draft: bool | None = None

    @model_validator(mode="after")
    def _requires_change(self) -> NarratorKeyEventUpdateRequest:
        if not self.model_dump(exclude_unset=True):
            raise ValueError("Provide at least one key event field")
        return self


class NarratorTurnResponse(NarratorSessionApiModel):
    session: ChapterSessionRecord
    user_turn: SessionTurnRecord
    ai_turn: SessionTurnRecord
    suggested_actions: list[SessionSuggestedActionRecord] = Field(default_factory=list)
    key_event_candidates: list[KeyEventRecord] = Field(default_factory=list)
    memory_proposal_candidates: list[MemoryProposalRecord] = Field(default_factory=list)
    story_line_update_candidates: list[AiStoryLineUpdateCandidate] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class NarratorSuggestedActionsResponse(NarratorSessionApiModel):
    session: ChapterSessionRecord
    source_turn: SessionTurnRecord
    suggested_actions: list[SessionSuggestedActionRecord] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class NarratorSessionLogResponse(NarratorSessionApiModel):
    project: ProjectRecord
    chapter: ChapterRecord | None = None
    session: ChapterSessionRecord
    turns: list[SessionTurnRecord] = Field(default_factory=list)
    suggested_actions: list[SessionSuggestedActionRecord] = Field(default_factory=list)
    key_events: list[KeyEventRecord] = Field(default_factory=list)
    memory_proposals: list[MemoryProposalRecord] = Field(default_factory=list)
