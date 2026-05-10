from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.projects import ProjectRecord
from app.models.story_runtime import (
    ChapterRecord,
    ChapterSessionRecord,
    DraftMode,
    DraftStatus,
    DraftVersionRecord,
    ForecastRecord,
    MemoryItemStatus,
    MemoryProposalRecord,
    StoryLineStatus,
)


ReasoningEffort = Literal["low", "medium", "high"]
ChapterReviewStatus = Literal["pending", "applied"]
ChapterReviewLineUpdateStatus = Literal["pending", "accepted", "rejected", "deferred"]
ChapterReviewNoteType = Literal["contradiction", "open_question"]
ChapterReviewNoteStatus = Literal["pending", "resolved", "rejected", "deferred"]
ChapterReviewDecisionStatus = Literal["accepted", "edited", "rejected", "deferred"]
DraftAssistScope = Literal["selection", "document"]
DraftAssistActionKey = Literal[
    "rewrite_simpler",
    "rewrite_expressive",
    "strengthen_conflict",
    "strengthen_emotion",
    "improve_dialogue",
    "add_atmosphere",
    "shorten",
    "explain_weakness",
    "suggest_variants",
    "improve_rhythm",
    "expand",
    "check_coherence",
    "suggest_title",
]


class Stage7ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DraftAssemblyRequest(Stage7ApiModel):
    mode: DraftMode = "literary"
    required_event_ids: list[str] = Field(default_factory=list)
    excluded_turn_ids: list[str] = Field(default_factory=list)
    style_notes: str | None = Field(default=None, max_length=4000)
    provider_id: str | None = None
    model_id: str | None = None
    temperature: float | None = Field(default=None, ge=0, le=2)
    top_p: float | None = Field(default=None, ge=0, le=1)
    reasoning_effort: ReasoningEffort | None = None


class DraftAssemblyResponse(Stage7ApiModel):
    project: ProjectRecord
    chapter: ChapterRecord
    session: ChapterSessionRecord
    draft_version: DraftVersionRecord
    warnings: list[str] = Field(default_factory=list)


class DraftUpdateRequest(Stage7ApiModel):
    markdown: str = Field(min_length=1)
    status: DraftStatus = "edited"
    mode: DraftMode = "literary"


class DraftUpdateResponse(Stage7ApiModel):
    chapter: ChapterRecord
    draft_version: DraftVersionRecord


class EditorSelectionRange(Stage7ApiModel):
    from_: int = Field(ge=0, alias="from")
    to: int = Field(ge=0)


class DraftAssistRequest(Stage7ApiModel):
    scope: DraftAssistScope = "selection"
    action_key: DraftAssistActionKey | None = None
    selection_markdown: str = Field(min_length=1, max_length=200000)
    selection_range: EditorSelectionRange | None = None
    draft_markdown: str | None = Field(default=None, max_length=200000)
    source_draft_version_id: str | None = None
    source_turn_ids: list[str] = Field(default_factory=list)
    related_memory_item_ids: list[str] = Field(default_factory=list)
    related_story_line_ids: list[str] = Field(default_factory=list)
    instructions: str = Field(min_length=1, max_length=4000)
    provider_id: str | None = None
    model_id: str | None = None
    temperature: float | None = Field(default=None, ge=0, le=2)
    top_p: float | None = Field(default=None, ge=0, le=1)
    reasoning_effort: ReasoningEffort | None = None


class DraftAssistResponse(Stage7ApiModel):
    replacement_markdown: str
    rationale: str | None = None
    warnings: list[str] = Field(default_factory=list)
    variants: list[str] = Field(default_factory=list)


class ChapterReviewCreate(Stage7ApiModel):
    chapter_id: str
    source_session_id: str | None = None
    source_draft_version_id: str | None = None
    summary: str = Field(min_length=1)
    status: ChapterReviewStatus = "pending"
    warnings: list[str] = Field(default_factory=list)


class ChapterReviewRecord(ChapterReviewCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    created_at: str
    updated_at: str


class ChapterReviewStoryLineUpdateCreate(Stage7ApiModel):
    review_id: str
    target_story_line_id: str | None = None
    title: str = Field(min_length=1, max_length=180)
    before_state: str | None = None
    after_state: str = Field(min_length=1)
    event_summary: str | None = None
    reason: str | None = None
    status: ChapterReviewLineUpdateStatus = "pending"


class ChapterReviewStoryLineUpdateRecord(ChapterReviewStoryLineUpdateCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    created_at: str


class ChapterReviewStoryLineUpdateStatusPatch(Stage7ApiModel):
    target_story_line_id: str | None = None
    status: ChapterReviewLineUpdateStatus | None = None


class ChapterReviewNoteCreate(Stage7ApiModel):
    review_id: str
    note_type: ChapterReviewNoteType
    title: str = Field(min_length=1, max_length=180)
    body: dict[str, object] = Field(default_factory=dict)
    severity: Literal["low", "medium", "high"] | None = None
    status: ChapterReviewNoteStatus = "pending"
    decision_note: str | None = None


class ChapterReviewNoteRecord(ChapterReviewNoteCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    created_at: str


class ChapterReviewNoteStatusPatch(Stage7ApiModel):
    status: ChapterReviewNoteStatus | None = None
    decision_note: str | None = None


class ChapterReviewGenerateRequest(Stage7ApiModel):
    source_draft_version_id: str | None = None
    provider_id: str | None = None
    model_id: str | None = None
    temperature: float | None = Field(default=None, ge=0, le=2)
    top_p: float | None = Field(default=None, ge=0, le=1)
    reasoning_effort: ReasoningEffort | None = None


class ChapterReviewResponse(Stage7ApiModel):
    project: ProjectRecord
    chapter: ChapterRecord
    session: ChapterSessionRecord | None = None
    draft_version: DraftVersionRecord | None = None
    review: ChapterReviewRecord
    memory_proposals: list[MemoryProposalRecord] = Field(default_factory=list)
    story_line_updates: list[ChapterReviewStoryLineUpdateRecord] = Field(default_factory=list)
    notes: list[ChapterReviewNoteRecord] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ChapterReviewMemoryDecision(Stage7ApiModel):
    proposal_id: str
    status: ChapterReviewDecisionStatus
    suggested_payload: dict[str, object] | None = None
    target_status: MemoryItemStatus = "canon"


class ChapterReviewStoryLineDecision(Stage7ApiModel):
    update_id: str
    status: Literal["accepted", "rejected", "deferred"]
    target_story_line_id: str | None = None
    target_status: StoryLineStatus | None = None


class ChapterReviewNoteDecision(Stage7ApiModel):
    note_id: str
    status: Literal["resolved", "rejected", "deferred"]
    decision_note: str | None = None


class ChapterReviewApplyRequest(Stage7ApiModel):
    review_id: str | None = None
    memory_decisions: list[ChapterReviewMemoryDecision] = Field(default_factory=list)
    story_line_decisions: list[ChapterReviewStoryLineDecision] = Field(default_factory=list)
    note_decisions: list[ChapterReviewNoteDecision] = Field(default_factory=list)


class ForecastGenerateRequest(Stage7ApiModel):
    source_chapter_id: str
    horizon_chapters: int = Field(default=2, ge=1, le=3)
    active_story_line_ids: list[str] = Field(default_factory=list)
    provider_id: str | None = None
    model_id: str | None = None
    temperature: float | None = Field(default=None, ge=0, le=2)
    top_p: float | None = Field(default=None, ge=0, le=1)
    reasoning_effort: ReasoningEffort | None = None


class ForecastListResponse(Stage7ApiModel):
    forecasts: list[ForecastRecord] = Field(default_factory=list)
