from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.story_runtime import MemoryItemType, StoryLineType

AiActionType = Literal[
    "analyze_synopsis",
    "extract_story_memory",
    "suggest_story_lines",
    "suggest_start_points",
    "prepare_chapter_session",
    "narrate_turn",
    "summarize_session",
    "extract_key_events",
    "assemble_draft",
    "edit_markdown_fragment",
    "review_chapter",
    "extract_memory_updates",
    "update_story_lines",
    "forecast_next",
    "check_contradictions",
]
PrivacyLevel = Literal["local", "external", "project", "sensitive"]
ReasoningEffort = Literal["low", "medium", "high"]
AiActionStreamEventType = Literal[
    "start",
    "delta",
    "structured_delta",
    "warning",
    "error",
    "done",
    "narration_delta",
    "suggested_action",
    "memory_candidate",
    "line_update_candidate",
]


class StrictAiModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AiActionContext(StrictAiModel):
    synopsis: str | None = None
    project: dict[str, object] | None = None
    memory_items: list[dict[str, object]] = Field(default_factory=list)
    story_lines: list[dict[str, object]] = Field(default_factory=list)
    chapter: dict[str, object] | None = None
    session: dict[str, object] | None = None
    turns: list[dict[str, object]] = Field(default_factory=list)
    draft_markdown: str | None = None
    selection_markdown: str | None = None
    instructions: str | None = None
    extra: dict[str, object] = Field(default_factory=dict)


class AiActionRequest(StrictAiModel):
    action_type: AiActionType
    project_id: str | None = None
    provider_id: str | None = None
    model_id: str | None = None
    input: dict[str, object] = Field(default_factory=dict)
    context: AiActionContext = Field(default_factory=AiActionContext)
    streaming: bool = False
    privacy_level: PrivacyLevel = "project"
    temperature: float = Field(default=0.7, ge=0, le=2)
    top_p: float | None = Field(default=None, ge=0, le=1)
    reasoning_effort: ReasoningEffort | None = None


class AiActionProviderReference(StrictAiModel):
    provider_id: str
    model_id: str
    provider_name: str
    provider_type: str
    is_external: bool


class AiActionWarning(StrictAiModel):
    code: str
    message: str


class AiActionError(StrictAiModel):
    code: str
    message: str
    details: dict[str, object] = Field(default_factory=dict)


class AiActionResult(StrictAiModel):
    action_type: AiActionType
    provider: AiActionProviderReference
    text: str = ""
    structured_json: dict[str, object] | None = None
    suggestions: list[dict[str, object]] = Field(default_factory=list)
    memory_candidates: list[dict[str, object]] = Field(default_factory=list)
    story_line_updates: list[dict[str, object]] = Field(default_factory=list)
    warnings: list[AiActionWarning] = Field(default_factory=list)
    repair_performed: bool = False


class AiActionDefinitionResponse(StrictAiModel):
    action_type: AiActionType
    description: str
    structured: bool
    supports_streaming: bool
    output_schema: dict[str, object]


class AiActionStreamEvent(StrictAiModel):
    event: AiActionStreamEventType
    payload: dict[str, object] = Field(default_factory=dict)


class AiQuestion(StrictAiModel):
    question: str = Field(min_length=1)
    why: str | None = None


class AiMemoryCandidate(StrictAiModel):
    type: MemoryItemType
    title: str = Field(min_length=1, max_length=180)
    summary: str | None = None
    body: str | None = None
    importance: int = 0
    reason: str | None = None


class AiStoryLineCandidate(StrictAiModel):
    type: StoryLineType
    title: str = Field(min_length=1, max_length=180)
    description: str | None = None
    current_state: str | None = None
    priority: int = 0
    reason: str | None = None


class AiStartPointCandidate(StrictAiModel):
    title: str = Field(min_length=1, max_length=180)
    situation: str = Field(min_length=1)
    present_character_titles: list[str] = Field(default_factory=list)
    tension: str | None = None
    user_role_hint: str | None = None


class AiSuggestedAction(StrictAiModel):
    label: str = Field(min_length=1, max_length=120)
    action: str = Field(min_length=1)
    tone: str | None = None


class AiKeyEventCandidate(StrictAiModel):
    title: str = Field(min_length=1, max_length=180)
    summary: str = Field(min_length=1)
    consequences: str | None = None
    related_memory_titles: list[str] = Field(default_factory=list)
    related_story_line_titles: list[str] = Field(default_factory=list)


class AiMemoryProposalCandidate(StrictAiModel):
    proposal_type: str = Field(min_length=1, max_length=80)
    title: str | None = None
    suggested_payload: dict[str, object] = Field(default_factory=dict)
    reason: str | None = None


class AiStoryLineUpdateCandidate(StrictAiModel):
    title: str = Field(min_length=1, max_length=180)
    before_state: str | None = None
    after_state: str = Field(min_length=1)
    event_summary: str | None = None
    reason: str | None = None


class AiContradictionCandidate(StrictAiModel):
    title: str = Field(min_length=1, max_length=180)
    description: str = Field(min_length=1)
    severity: Literal["low", "medium", "high"] = "medium"
    related_memory_titles: list[str] = Field(default_factory=list)
    suggestion: str | None = None


class AiForecastOption(StrictAiModel):
    title: str = Field(min_length=1, max_length=180)
    description: str = Field(min_length=1)
    likely_consequences: list[str] = Field(default_factory=list)
    related_story_line_titles: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)


class AnalyzeSynopsisOutput(StrictAiModel):
    understood_synopsis: str = Field(min_length=1)
    emotional_core: str | None = None
    suggested_title: str | None = None
    questions: list[AiQuestion] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ExtractStoryMemoryOutput(StrictAiModel):
    memory_items: list[AiMemoryCandidate] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class SuggestStoryLinesOutput(StrictAiModel):
    story_lines: list[AiStoryLineCandidate] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class SuggestStartPointsOutput(StrictAiModel):
    start_points: list[AiStartPointCandidate] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class PrepareChapterSessionOutput(StrictAiModel):
    narrator_opening: str = Field(min_length=1)
    suggested_actions: list[AiSuggestedAction] = Field(default_factory=list)
    relevant_memory_titles: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class NarrateTurnOutput(StrictAiModel):
    narration_markdown: str = Field(min_length=1)
    suggested_actions: list[AiSuggestedAction] = Field(default_factory=list)
    key_event_candidates: list[AiKeyEventCandidate] = Field(default_factory=list)
    memory_proposal_candidates: list[AiMemoryProposalCandidate] = Field(default_factory=list)
    story_line_update_candidates: list[AiStoryLineUpdateCandidate] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class SummarizeSessionOutput(StrictAiModel):
    summary: str = Field(min_length=1)
    key_points: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ExtractKeyEventsOutput(StrictAiModel):
    key_events: list[AiKeyEventCandidate] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class AssembleDraftOutput(StrictAiModel):
    markdown: str = Field(min_length=1)
    warnings: list[str] = Field(default_factory=list)


class EditMarkdownFragmentOutput(StrictAiModel):
    replacement_markdown: str = Field(min_length=1)
    rationale: str | None = None
    warnings: list[str] = Field(default_factory=list)


class ReviewChapterOutput(StrictAiModel):
    summary: str = Field(min_length=1)
    memory_proposals: list[AiMemoryProposalCandidate] = Field(default_factory=list)
    story_line_updates: list[AiStoryLineUpdateCandidate] = Field(default_factory=list)
    contradictions: list[AiContradictionCandidate] = Field(default_factory=list)
    open_questions: list[AiQuestion] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ExtractMemoryUpdatesOutput(StrictAiModel):
    memory_updates: list[AiMemoryProposalCandidate] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class UpdateStoryLinesOutput(StrictAiModel):
    story_line_updates: list[AiStoryLineUpdateCandidate] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ForecastNextOutput(StrictAiModel):
    summary: str = Field(min_length=1)
    options: list[AiForecastOption] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class CheckContradictionsOutput(StrictAiModel):
    contradictions: list[AiContradictionCandidate] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
