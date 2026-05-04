from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

PROJECT_METADATA_MAX_LENGTH = 1200
PROJECT_BRIEF_MAX_LENGTH = 5000


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
    is_hidden: bool = False
    settings: ProjectSettingsRecord | None = None


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1200)
    synopsis: str | None = Field(default=None, max_length=5000)
    provider_id: str | None = None
    model_id: str | None = None
    is_hidden: bool = False


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1200)
    synopsis: str | None = Field(default=None, max_length=5000)
    provider_id: str | None = None
    model_id: str | None = None
    status: str | None = Field(default=None, max_length=40)
    is_hidden: bool | None = None


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
    genre: str | None = Field(default=None, max_length=PROJECT_METADATA_MAX_LENGTH)
    tone: str | None = Field(default=None, max_length=PROJECT_METADATA_MAX_LENGTH)
    setting: str | None = Field(default=None, max_length=PROJECT_BRIEF_MAX_LENGTH)
    format: str | None = Field(default=None, max_length=PROJECT_METADATA_MAX_LENGTH)
    central_conflict: str | None = Field(default=None, max_length=PROJECT_BRIEF_MAX_LENGTH)
    themes: list[str] = Field(default_factory=list)
    directions: list[str] = Field(default_factory=list)
    selected_direction: str | None = Field(default=None, max_length=1200)
    target_length: str | None = Field(default=None, max_length=PROJECT_METADATA_MAX_LENGTH)
    point_of_view: str | None = Field(default=None, max_length=PROJECT_METADATA_MAX_LENGTH)
    provider_id: str | None = None
    model_id: str | None = None
    is_hidden: bool = False


class WorkspaceSettings(BaseModel):
    genre: str | None = Field(default=None, max_length=PROJECT_METADATA_MAX_LENGTH)
    tone: str | None = Field(default=None, max_length=PROJECT_METADATA_MAX_LENGTH)
    setting: str | None = Field(default=None, max_length=PROJECT_BRIEF_MAX_LENGTH)
    format: str | None = Field(default=None, max_length=PROJECT_METADATA_MAX_LENGTH)
    central_conflict: str | None = Field(default=None, max_length=PROJECT_BRIEF_MAX_LENGTH)
    themes: list[str] = Field(default_factory=list)
    target_length: str | None = Field(default=None, max_length=PROJECT_METADATA_MAX_LENGTH)
    point_of_view: str | None = Field(default=None, max_length=PROJECT_METADATA_MAX_LENGTH)


class IdeaLabRecord(BaseModel):
    source_text: str | None = None
    expanded_synopsis: str | None = None
    selected_direction: str | None = None
    directions: list[str] = Field(default_factory=list)
    themes: list[str] = Field(default_factory=list)
    motives: list[str] = Field(default_factory=list)
    conflicts: list[str] = Field(default_factory=list)


class WorldEntryRecord(BaseModel):
    id: str | None = None
    title: str = Field(min_length=1, max_length=160)
    content: str | None = Field(default=None, max_length=5000)
    canon_status: str = Field(default="draft", max_length=40)


class WorldBibleRecord(BaseModel):
    rules: list[WorldEntryRecord] = Field(default_factory=list)
    locations: list[WorldEntryRecord] = Field(default_factory=list)
    factions: list[WorldEntryRecord] = Field(default_factory=list)


class CharacterWorkspaceRecord(BaseModel):
    id: str | None = None
    name: str = Field(min_length=1, max_length=160)
    gender: str | None = Field(default=None, max_length=120)
    age: str | None = Field(default=None, max_length=120)
    role: str | None = Field(default=None, max_length=160)
    biography: str | None = Field(default=None, max_length=5000)
    motivation: str | None = Field(default=None, max_length=1200)
    goal: str | None = Field(default=None, max_length=1200)
    fear: str | None = Field(default=None, max_length=1200)
    internal_conflict: str | None = Field(default=None, max_length=1200)


class CharacterRelationshipCreate(BaseModel):
    target_character_id: str = Field(min_length=1, max_length=160)
    relationship_type: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1200)


class CharacterRelationshipUpdate(CharacterRelationshipCreate):
    id: str | None = None


class CharacterRelationshipRecord(BaseModel):
    id: str
    project_id: str
    source_character_id: str
    target_character_id: str
    relationship_type: str
    description: str | None = None
    created_at: str
    updated_at: str
    source_character_name: str | None = None
    target_character_name: str | None = None


class CharacterCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    gender: str | None = Field(default=None, max_length=120)
    age: str | None = Field(default=None, max_length=120)
    role: str | None = Field(default=None, max_length=160)
    biography: str | None = Field(default=None, max_length=5000)
    motivation: str | None = Field(default=None, max_length=1200)
    goal: str | None = Field(default=None, max_length=1200)
    fear: str | None = Field(default=None, max_length=1200)
    internal_conflict: str | None = Field(default=None, max_length=1200)
    relationships: list[CharacterRelationshipCreate] = Field(default_factory=list)


class CharacterUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=160)
    gender: str | None = Field(default=None, max_length=120)
    age: str | None = Field(default=None, max_length=120)
    role: str | None = Field(default=None, max_length=160)
    biography: str | None = Field(default=None, max_length=5000)
    motivation: str | None = Field(default=None, max_length=1200)
    goal: str | None = Field(default=None, max_length=1200)
    fear: str | None = Field(default=None, max_length=1200)
    internal_conflict: str | None = Field(default=None, max_length=1200)
    relationships: list[CharacterRelationshipUpdate] | None = None


class CharacterRecord(BaseModel):
    id: str
    project_id: str
    name: str
    gender: str | None = None
    age: str | None = None
    role: str | None = None
    biography: str | None = None
    motivation: str | None = None
    goal: str | None = None
    fear: str | None = None
    internal_conflict: str | None = None
    created_at: str
    updated_at: str
    relationships: list[CharacterRelationshipRecord] = Field(default_factory=list)


class CharacterListItem(CharacterRecord):
    pass


class CharacterBulkCreateItem(BaseModel):
    draft_id: str | None = Field(default=None, max_length=80)
    name: str = Field(min_length=1, max_length=160)
    gender: str | None = Field(default=None, max_length=120)
    age: str | None = Field(default=None, max_length=120)
    role: str | None = Field(default=None, max_length=160)
    biography: str | None = Field(default=None, max_length=5000)
    motivation: str | None = Field(default=None, max_length=1200)
    goal: str | None = Field(default=None, max_length=1200)
    fear: str | None = Field(default=None, max_length=1200)
    internal_conflict: str | None = Field(default=None, max_length=1200)


class CharacterBulkCreateRelationship(BaseModel):
    source_draft_id: str = Field(min_length=1, max_length=80)
    target_draft_id: str = Field(min_length=1, max_length=80)
    relationship_type: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1200)


class CharacterBulkCreate(BaseModel):
    characters: list[CharacterBulkCreateItem] = Field(min_length=1)
    relationships: list[CharacterBulkCreateRelationship] = Field(default_factory=list)


class CharacterBulkCreateResponse(BaseModel):
    characters: list[CharacterRecord] = Field(default_factory=list)
    relationships: list[CharacterRelationshipRecord] = Field(default_factory=list)


class CharacterBulkDraftRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=12000)
    provider_id: str | None = None
    model_id: str | None = None
    max_characters: int = Field(default=6, ge=1, le=20)
    include_relationships: bool = True


class CharacterBulkDraftItem(BaseModel):
    draft_id: str
    name: str
    gender: str | None = None
    age: str | None = None
    role: str | None = None
    biography: str | None = None


class CharacterBulkDraftRelationship(BaseModel):
    source_draft_id: str
    target_draft_id: str
    relationship_type: str
    description: str | None = None


class CharacterBulkDraftResponse(BaseModel):
    characters: list[CharacterBulkDraftItem] = Field(default_factory=list)
    relationships: list[CharacterBulkDraftRelationship] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    raw_text: str | None = None


CharacterProfileAssistMode = Literal["expand", "revise", "relationships", "conflict"]


class CharacterProfileDraft(BaseModel):
    name: str | None = Field(default=None, max_length=160)
    gender: str | None = Field(default=None, max_length=120)
    age: str | None = Field(default=None, max_length=120)
    role: str | None = Field(default=None, max_length=160)
    biography: str | None = Field(default=None, max_length=5000)
    motivation: str | None = Field(default=None, max_length=1200)
    goal: str | None = Field(default=None, max_length=1200)
    fear: str | None = Field(default=None, max_length=1200)
    internal_conflict: str | None = Field(default=None, max_length=1200)


class CharacterProfileAssistRequest(BaseModel):
    character_id: str | None = None
    draft: CharacterProfileDraft = Field(default_factory=CharacterProfileDraft)
    instruction: str = Field(default="", max_length=4000)
    mode: CharacterProfileAssistMode = "expand"
    provider_id: str | None = None
    model_id: str | None = None


class CharacterProfileAssistResponse(BaseModel):
    patch: CharacterProfileDraft = Field(default_factory=CharacterProfileDraft)
    suggested_relationships: list[CharacterRelationshipCreate] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    raw_text: str | None = None


class PlotArcWorkspaceRecord(BaseModel):
    id: str | None = None
    title: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=5000)
    arc_type: str = Field(default="main", max_length=60)
    position: int = 0


class ChapterPlanRecord(BaseModel):
    id: str | None = None
    title: str = Field(min_length=1, max_length=160)
    summary: str | None = Field(default=None, max_length=5000)
    status: str = Field(default="draft", max_length=40)
    position: int = 0


class SceneEditorRecord(BaseModel):
    id: str | None = None
    chapter_id: str | None = None
    title: str | None = Field(default=None, max_length=160)
    summary: str | None = Field(default=None, max_length=5000)
    body: str = Field(default="", max_length=80000)
    position: int = 0
    created_at: str | None = None
    updated_at: str | None = None


class ChapterEditorRecord(ChapterPlanRecord):
    body: str = Field(default="", max_length=180000)
    scenes: list[SceneEditorRecord] = Field(default_factory=list)
    created_at: str | None = None
    updated_at: str | None = None


class PlotBoardRecord(BaseModel):
    arcs: list[PlotArcWorkspaceRecord] = Field(default_factory=list)
    chapters: list[ChapterPlanRecord] = Field(default_factory=list)


class CanonFactLinkRecord(BaseModel):
    id: str | None = None
    target_type: Literal["character", "chapter", "scene", "event", "world"]
    target_id: str = Field(min_length=1, max_length=160)
    label: str | None = Field(default=None, max_length=160)


class CanonFactRecord(BaseModel):
    id: str | None = None
    title: str = Field(min_length=1, max_length=160)
    fact: str = Field(min_length=1, max_length=5000)
    category: str = Field(default="general", max_length=80)
    status: str = Field(default="confirmed", max_length=40)
    source_type: str | None = Field(default=None, max_length=80)
    source_id: str | None = Field(default=None, max_length=160)
    notes: str | None = Field(default=None, max_length=2000)
    links: list[CanonFactLinkRecord] = Field(default_factory=list)
    created_at: str | None = None
    updated_at: str | None = None


class TimelineEventRecord(BaseModel):
    id: str | None = None
    title: str = Field(min_length=1, max_length=160)
    summary: str | None = Field(default=None, max_length=5000)
    event_time: str | None = Field(default=None, max_length=120)
    source_chapter_id: str | None = None
    position: int = 0
    created_at: str | None = None
    updated_at: str | None = None


class CanonWorkspaceRecord(BaseModel):
    facts: list[CanonFactRecord] = Field(default_factory=list)
    timeline: list[TimelineEventRecord] = Field(default_factory=list)


class ProjectWorkspaceRecord(BaseModel):
    project: ProjectRecord
    settings: WorkspaceSettings
    idea_lab: IdeaLabRecord
    world_bible: WorldBibleRecord
    characters: list[CharacterWorkspaceRecord] = Field(default_factory=list)
    plot_board: PlotBoardRecord
    canon: CanonWorkspaceRecord = Field(default_factory=CanonWorkspaceRecord)


class ProjectWorkspaceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1200)
    synopsis: str | None = Field(default=None, max_length=5000)
    provider_id: str | None = None
    model_id: str | None = None
    is_hidden: bool | None = None
    settings: WorkspaceSettings = Field(default_factory=WorkspaceSettings)
    idea_lab: IdeaLabRecord = Field(default_factory=IdeaLabRecord)
    world_bible: WorldBibleRecord = Field(default_factory=WorldBibleRecord)
    characters: list[CharacterWorkspaceRecord] = Field(default_factory=list)
    plot_board: PlotBoardRecord = Field(default_factory=PlotBoardRecord)
    canon: CanonWorkspaceRecord = Field(default_factory=CanonWorkspaceRecord)


class ChapterEditorRecordSet(BaseModel):
    project: ProjectRecord
    settings: WorkspaceSettings
    characters: list[CharacterWorkspaceRecord] = Field(default_factory=list)
    arcs: list[PlotArcWorkspaceRecord] = Field(default_factory=list)
    chapters: list[ChapterEditorRecord] = Field(default_factory=list)
    saved_at: str | None = None


class ChapterEditorUpdate(BaseModel):
    chapters: list[ChapterEditorRecord] = Field(default_factory=list)


ChapterAiAction = Literal["continue", "rewrite", "critique", "brainstorm"]


class ChapterAiRequest(BaseModel):
    action: ChapterAiAction
    chapter_id: str | None = None
    scene_id: str | None = None
    selected_text: str | None = Field(default=None, max_length=20000)
    draft_text: str | None = Field(default=None, max_length=60000)
    instructions: str | None = Field(default=None, max_length=4000)
    provider_id: str | None = None
    model_id: str | None = None
    persona: str | None = Field(default=None, max_length=1200)
    stream: bool = True


class ContinuityCheckRequest(BaseModel):
    text: str = Field(min_length=1, max_length=60000)
    chapter_id: str | None = None
    provider_id: str | None = None
    model_id: str | None = None


class ContinuityIssueRecord(BaseModel):
    id: str
    severity: Literal["info", "warning", "conflict"] = "info"
    summary: str
    detail: str | None = None
    related_fact_ids: list[str] = Field(default_factory=list)
    suggested_fact: CanonFactRecord | None = None


class ContinuityCheckRecord(BaseModel):
    id: str
    project_id: str
    issues: list[ContinuityIssueRecord] = Field(default_factory=list)
    created_at: str
