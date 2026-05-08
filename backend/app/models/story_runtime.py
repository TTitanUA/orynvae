from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

MemoryItemType = Literal[
    "character",
    "location",
    "item",
    "group",
    "world_rule",
    "mystery",
    "event",
    "canon_fact",
    "note",
]
MemoryItemStatus = Literal["proposed", "draft", "canon", "rejected", "outdated"]
MemoryProposalStatus = Literal["pending", "accepted", "edited", "rejected", "deferred"]
StoryLineType = Literal["character", "mystery", "relationship", "threat", "theme", "custom"]
StoryLineStatus = Literal["proposed", "active", "sleeping", "completed", "rejected"]
ChapterStatus = Literal[
    "planned",
    "in_session",
    "session_done",
    "draft_generated",
    "reviewing",
    "completed",
]
ChapterSessionStatus = Literal["preparing", "active", "paused", "completed", "draft_ready", "reviewed"]
SessionActorType = Literal["ai", "user", "system"]
SessionTurnType = Literal["narration", "action", "dialogue", "author_command", "choice", "note", "summary"]
DraftMode = Literal["faithful", "literary", "shorter", "expanded", "dialogue_focus", "atmosphere_focus"]
DraftStatus = Literal["generated", "edited", "accepted"]


class MemoryItemCreate(BaseModel):
    type: MemoryItemType
    title: str = Field(min_length=1, max_length=180)
    summary: str | None = None
    body: str | None = None
    status: MemoryItemStatus = "draft"
    source_type: str | None = None
    source_id: str | None = None
    importance: int = 0


class MemoryItemUpdate(BaseModel):
    type: MemoryItemType | None = None
    title: str | None = Field(default=None, min_length=1, max_length=180)
    summary: str | None = None
    body: str | None = None
    status: MemoryItemStatus | None = None
    source_type: str | None = None
    source_id: str | None = None
    importance: int | None = None


class MemoryItemRecord(MemoryItemCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    created_at: str
    updated_at: str


class MemoryProposalCreate(BaseModel):
    proposal_type: str = Field(min_length=1, max_length=80)
    target_item_id: str | None = None
    suggested_payload: dict[str, object] = Field(default_factory=dict)
    reason: str | None = None
    source_type: str | None = None
    source_id: str | None = None
    status: MemoryProposalStatus = "pending"


class MemoryProposalRecord(MemoryProposalCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    created_at: str


class StoryLineCreate(BaseModel):
    type: StoryLineType
    title: str = Field(min_length=1, max_length=180)
    description: str | None = None
    current_state: str | None = None
    status: StoryLineStatus = "proposed"
    priority: int = 0
    last_progress_chapter_id: str | None = None


class StoryLineUpdate(BaseModel):
    type: StoryLineType | None = None
    title: str | None = Field(default=None, min_length=1, max_length=180)
    description: str | None = None
    current_state: str | None = None
    status: StoryLineStatus | None = None
    priority: int | None = None
    last_progress_chapter_id: str | None = None


class StoryLineRecord(StoryLineCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    created_at: str
    updated_at: str


class StoryLineProgressCreate(BaseModel):
    story_line_id: str
    chapter_id: str | None = None
    session_id: str | None = None
    before_state: str | None = None
    after_state: str | None = None
    event_summary: str | None = None


class StoryLineProgressRecord(StoryLineProgressCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    created_at: str


class ChapterCreate(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    order_index: int = 0
    status: ChapterStatus = "planned"
    synopsis: str | None = None
    draft_markdown: str = ""
    final_markdown: str = ""
    session_id: str | None = None


class ChapterUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=180)
    order_index: int | None = None
    status: ChapterStatus | None = None
    synopsis: str | None = None
    draft_markdown: str | None = None
    final_markdown: str | None = None
    session_id: str | None = None


class ChapterRecord(ChapterCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    created_at: str
    updated_at: str


class ChapterSessionCreate(BaseModel):
    chapter_id: str | None = None
    status: ChapterSessionStatus = "preparing"
    user_role: str | None = None
    controlled_character_ids: list[str] = Field(default_factory=list)
    active_story_line_ids: list[str] = Field(default_factory=list)
    tone: str | None = None
    pace: str | None = None
    expansion_policy_override: str | None = None
    started_at: str | None = None
    paused_at: str | None = None
    completed_at: str | None = None


class ChapterSessionUpdate(BaseModel):
    chapter_id: str | None = None
    status: ChapterSessionStatus | None = None
    user_role: str | None = None
    controlled_character_ids: list[str] | None = None
    active_story_line_ids: list[str] | None = None
    tone: str | None = None
    pace: str | None = None
    expansion_policy_override: str | None = None
    started_at: str | None = None
    paused_at: str | None = None
    completed_at: str | None = None


class ChapterSessionRecord(ChapterSessionCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    created_at: str
    updated_at: str


class SessionTurnCreate(BaseModel):
    turn_index: int
    actor_type: SessionActorType
    turn_type: SessionTurnType
    content: str
    related_memory_item_ids: list[str] = Field(default_factory=list)
    related_story_line_ids: list[str] = Field(default_factory=list)
    is_key_event: bool = False
    exclude_from_draft: bool = False


class SessionTurnRecord(SessionTurnCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    session_id: str
    created_at: str


class KeyEventCreate(BaseModel):
    session_id: str
    chapter_id: str | None = None
    title: str = Field(min_length=1, max_length=180)
    summary: str | None = None
    consequences: str | None = None
    related_memory_item_ids: list[str] = Field(default_factory=list)
    related_story_line_ids: list[str] = Field(default_factory=list)
    include_in_draft: bool = True


class KeyEventRecord(KeyEventCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    created_at: str


class DraftVersionCreate(BaseModel):
    chapter_id: str
    source_session_id: str | None = None
    mode: DraftMode = "faithful"
    markdown: str
    status: DraftStatus = "generated"


class DraftVersionRecord(DraftVersionCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    created_at: str


class ForecastOptionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    description: str | None = None
    likely_consequences: list[str] = Field(default_factory=list)
    related_story_line_ids: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    is_selected_as_orientation: bool = False


class ForecastCreate(BaseModel):
    source_chapter_id: str | None = None
    summary: str | None = None
    status: str = "generated"
    options: list[ForecastOptionCreate] = Field(default_factory=list)


class ForecastOptionRecord(ForecastOptionCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    forecast_id: str


class ForecastRecord(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    source_chapter_id: str | None = None
    summary: str | None = None
    status: str
    created_at: str
    options: list[ForecastOptionRecord] = Field(default_factory=list)
