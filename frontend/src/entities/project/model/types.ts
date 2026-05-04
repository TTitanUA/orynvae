export type ProjectSettings = {
  genre: string | null;
  tone: string | null;
  setting: string | null;
  format: string | null;
  live_mode_recommended: boolean;
  settings: Record<string, unknown>;
};

export type Project = {
  id: string;
  name: string;
  description: string | null;
  synopsis: string | null;
  provider_id: string | null;
  model_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  is_hidden: boolean;
  settings: ProjectSettings | null;
};

export type ProjectSetupAnalysis = {
  title: string;
  description: string;
  synopsis: string;
  genre: string;
  tone: string;
  setting: string;
  format: string;
  central_conflict: string;
  themes: string[];
  directions: string[];
  target_length: string | null;
  point_of_view: string | null;
  raw_text: string | null;
  warnings: string[];
};

export type ProjectSetupAnalysisPayload = {
  idea_text: string;
  provider_id?: string;
  model_id?: string;
};

export type ProjectSetupCreatePayload = {
  name: string;
  idea_text: string;
  description?: string;
  synopsis?: string;
  genre?: string;
  tone?: string;
  setting?: string;
  format?: string;
  central_conflict?: string;
  themes: string[];
  directions: string[];
  selected_direction?: string;
  target_length?: string;
  point_of_view?: string;
  provider_id?: string;
  model_id?: string;
  is_hidden?: boolean;
};

export type WorkspaceSettings = {
  genre: string | null;
  tone: string | null;
  setting: string | null;
  format: string | null;
  central_conflict: string | null;
  themes: string[];
  target_length: string | null;
  point_of_view: string | null;
};

export type IdeaLab = {
  source_text: string | null;
  expanded_synopsis: string | null;
  selected_direction: string | null;
  directions: string[];
  themes: string[];
  motives: string[];
  conflicts: string[];
};

export type WorldEntry = {
  id?: string | null;
  title: string;
  content?: string | null;
  canon_status?: string;
};

export type WorldBible = {
  rules: WorldEntry[];
  locations: WorldEntry[];
  factions: WorldEntry[];
};

export type CharacterWorkspace = {
  id?: string | null;
  name: string;
  role?: string | null;
  biography?: string | null;
  motivation?: string | null;
  goal?: string | null;
  fear?: string | null;
  internal_conflict?: string | null;
};

export type PlotArcWorkspace = {
  id?: string | null;
  title: string;
  description?: string | null;
  arc_type: string;
  position: number;
};

export type ChapterPlan = {
  id?: string | null;
  title: string;
  summary?: string | null;
  status: string;
  position: number;
};

export type SceneEditor = {
  id?: string | null;
  chapter_id?: string | null;
  title?: string | null;
  summary?: string | null;
  body: string;
  position: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ChapterEditor = ChapterPlan & {
  body: string;
  scenes: SceneEditor[];
  created_at?: string | null;
  updated_at?: string | null;
};

export type PlotBoard = {
  arcs: PlotArcWorkspace[];
  chapters: ChapterPlan[];
};

export type CanonFactLink = {
  id?: string | null;
  target_type: "character" | "chapter" | "scene" | "event" | "world";
  target_id: string;
  label?: string | null;
};

export type CanonFact = {
  id?: string | null;
  title: string;
  fact: string;
  category: string;
  status: string;
  source_type?: string | null;
  source_id?: string | null;
  notes?: string | null;
  links: CanonFactLink[];
  created_at?: string | null;
  updated_at?: string | null;
};

export type TimelineEvent = {
  id?: string | null;
  title: string;
  summary?: string | null;
  event_time?: string | null;
  source_chapter_id?: string | null;
  position: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type CanonWorkspace = {
  facts: CanonFact[];
  timeline: TimelineEvent[];
};

export type ProjectWorkspace = {
  project: Project;
  settings: WorkspaceSettings;
  idea_lab: IdeaLab;
  world_bible: WorldBible;
  characters: CharacterWorkspace[];
  plot_board: PlotBoard;
  canon: CanonWorkspace;
};

export type ProjectWorkspacePayload = Omit<ProjectWorkspace, "project"> & {
  name: string;
  description?: string | null;
  synopsis?: string | null;
  provider_id?: string | null;
  model_id?: string | null;
  is_hidden?: boolean;
};

export type ChapterEditorState = {
  project: Project;
  settings: WorkspaceSettings;
  characters: CharacterWorkspace[];
  arcs: PlotArcWorkspace[];
  chapters: ChapterEditor[];
  saved_at: string | null;
};

export type ChapterEditorPayload = {
  chapters: ChapterEditor[];
};

export type ChapterAiAction = "continue" | "rewrite" | "critique" | "brainstorm";

export type ChapterAiPayload = {
  action: ChapterAiAction;
  chapter_id?: string | null;
  scene_id?: string | null;
  selected_text?: string | null;
  draft_text?: string | null;
  instructions?: string | null;
  provider_id?: string | null;
  model_id?: string | null;
  persona?: string | null;
  stream?: boolean;
};

export type ContinuityCheckPayload = {
  text: string;
  chapter_id?: string | null;
  provider_id?: string | null;
  model_id?: string | null;
};

export type ContinuityIssue = {
  id: string;
  severity: "info" | "warning" | "conflict";
  summary: string;
  detail?: string | null;
  related_fact_ids: string[];
  suggested_fact?: CanonFact | null;
};

export type ContinuityCheck = {
  id: string;
  project_id: string;
  issues: ContinuityIssue[];
  created_at: string;
};
