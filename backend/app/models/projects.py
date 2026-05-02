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


class WorkspaceSettings(BaseModel):
    genre: str | None = Field(default=None, max_length=120)
    tone: str | None = Field(default=None, max_length=120)
    setting: str | None = Field(default=None, max_length=240)
    format: str | None = Field(default=None, max_length=120)
    central_conflict: str | None = Field(default=None, max_length=600)
    themes: list[str] = Field(default_factory=list)
    target_length: str | None = Field(default=None, max_length=120)
    point_of_view: str | None = Field(default=None, max_length=120)


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
    role: str | None = Field(default=None, max_length=160)
    biography: str | None = Field(default=None, max_length=5000)
    motivation: str | None = Field(default=None, max_length=1200)
    goal: str | None = Field(default=None, max_length=1200)
    fear: str | None = Field(default=None, max_length=1200)
    internal_conflict: str | None = Field(default=None, max_length=1200)


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


class PlotBoardRecord(BaseModel):
    arcs: list[PlotArcWorkspaceRecord] = Field(default_factory=list)
    chapters: list[ChapterPlanRecord] = Field(default_factory=list)


class ProjectWorkspaceRecord(BaseModel):
    project: ProjectRecord
    settings: WorkspaceSettings
    idea_lab: IdeaLabRecord
    world_bible: WorldBibleRecord
    characters: list[CharacterWorkspaceRecord] = Field(default_factory=list)
    plot_board: PlotBoardRecord


class ProjectWorkspaceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1200)
    synopsis: str | None = Field(default=None, max_length=5000)
    provider_id: str | None = None
    model_id: str | None = None
    settings: WorkspaceSettings = Field(default_factory=WorkspaceSettings)
    idea_lab: IdeaLabRecord = Field(default_factory=IdeaLabRecord)
    world_bible: WorldBibleRecord = Field(default_factory=WorldBibleRecord)
    characters: list[CharacterWorkspaceRecord] = Field(default_factory=list)
    plot_board: PlotBoardRecord = Field(default_factory=PlotBoardRecord)
