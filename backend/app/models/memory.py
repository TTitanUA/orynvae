from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.projects import ProjectRecord
from app.models.runtime import RuntimeStatus
from app.models.story_runtime import (
    ChapterRecord,
    ChapterSessionRecord,
    MemoryItemCreate,
    MemoryItemRecord,
    MemoryItemStatus,
    MemoryItemUpdate,
    MemoryProposalRecord,
    StoryLineRecord,
)


class MemoryApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MemoryItemCreateRequest(MemoryItemCreate):
    model_config = ConfigDict(extra="forbid")


class MemoryItemUpdateRequest(MemoryItemUpdate):
    model_config = ConfigDict(extra="forbid")


class MemoryItemStatusRequest(MemoryApiModel):
    status: MemoryItemStatus


class MemoryProposalAcceptRequest(MemoryApiModel):
    suggested_payload: dict[str, object] | None = None
    target_status: MemoryItemStatus = "canon"


class MemoryProposalRejectRequest(MemoryApiModel):
    status: Literal["rejected", "deferred"] = "rejected"


class MemoryProposalDecisionResponse(MemoryApiModel):
    proposal: MemoryProposalRecord
    memory_item: MemoryItemRecord | None = None


class MemoryConflictCheckRequest(MemoryApiModel):
    content: str | None = Field(default=None, max_length=8000)
    candidate_payload: dict[str, object] = Field(default_factory=dict)
    target_item_id: str | None = None

    @model_validator(mode="after")
    def _requires_material(self) -> MemoryConflictCheckRequest:
        if not self.content and not self.candidate_payload:
            raise ValueError("Provide content or candidate_payload to check")
        return self


class MemoryContradictionWarning(MemoryApiModel):
    title: str
    description: str
    severity: Literal["low", "medium", "high"] = "medium"
    related_memory_titles: list[str] = Field(default_factory=list)
    suggestion: str | None = None


class MemoryConflictCheckResponse(MemoryApiModel):
    contradictions: list[MemoryContradictionWarning] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class WorkspaceNextStep(MemoryApiModel):
    code: Literal[
        "configure_ai",
        "prepare_first_chapter",
        "continue_session",
        "assemble_draft",
        "review_chapter",
        "forecast_next",
        "review_memory",
        "continue_story",
    ]
    label: str
    detail: str | None = None
    href: str | None = None


class WorkspaceMemoryCounts(MemoryApiModel):
    total: int
    proposed: int
    draft: int
    canon: int
    rejected: int
    outdated: int
    pending_proposals: int


class ProjectWorkspaceSummary(MemoryApiModel):
    project: ProjectRecord
    runtime: RuntimeStatus
    next_step: WorkspaceNextStep
    memory_counts: WorkspaceMemoryCounts
    pending_memory_items: list[MemoryItemRecord] = Field(default_factory=list)
    pending_proposals: list[MemoryProposalRecord] = Field(default_factory=list)
    active_story_lines: list[StoryLineRecord] = Field(default_factory=list)
    planned_chapter: ChapterRecord | None = None
    latest_chapter: ChapterRecord | None = None
    active_session: ChapterSessionRecord | None = None
    warnings: list[str] = Field(default_factory=list)
