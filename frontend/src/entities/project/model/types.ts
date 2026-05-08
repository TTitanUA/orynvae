export type Project = {
  id: string;
  title: string;
  synopsis: string;
  status: string;
  active_provider_id: string | null;
  active_model_id: string | null;
  expansion_policy: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type StartStoryMemoryType =
  | "character"
  | "location"
  | "item"
  | "group"
  | "world_rule"
  | "mystery"
  | "event"
  | "canon_fact"
  | "note";

export type StartStoryMemoryStatus = "proposed" | "draft" | "canon" | "rejected" | "outdated";

export type StartStoryLineType =
  | "character"
  | "mystery"
  | "relationship"
  | "threat"
  | "theme"
  | "custom";

export type StartStoryLineStatus = "proposed" | "active" | "sleeping" | "completed" | "rejected";

export type StartStoryExpansionPolicy = "draft" | "ask" | "request" | "mixed";
export type StartStoryReasoningEffort = "low" | "medium" | "high";

export type StartStoryQuestion = {
  question: string;
  why: string | null;
};

export type StartStoryMemoryCandidate = {
  type: StartStoryMemoryType;
  title: string;
  summary: string | null;
  body: string | null;
  status: StartStoryMemoryStatus;
  importance: number;
  reason: string | null;
};

export type StartStoryLineCandidate = {
  type: StartStoryLineType;
  title: string;
  description: string | null;
  current_state: string | null;
  status: StartStoryLineStatus;
  priority: number;
  reason: string | null;
};

export type StartStoryPointCandidate = {
  title: string;
  situation: string;
  present_character_titles: string[];
  tension: string | null;
  user_role_hint: string | null;
};

export type StartStoryAnalyzePayload = {
  synopsis: string;
  title?: string | null;
  tone?: string | null;
  avoid?: string | null;
  preferred_user_role?: string | null;
  provider_id?: string | null;
  model_id?: string | null;
  temperature?: number;
  top_p?: number | null;
  reasoning_effort?: StartStoryReasoningEffort | null;
};

export type StartStoryAnalysis = {
  source_synopsis: string;
  title: string | null;
  tone: string | null;
  avoid: string | null;
  preferred_user_role: string | null;
  provider_id: string;
  model_id: string;
  provider_name: string;
  provider_is_external: boolean;
  understood_synopsis: string;
  emotional_core: string | null;
  suggested_title: string | null;
  questions: StartStoryQuestion[];
  warnings: string[];
  memory_items: StartStoryMemoryCandidate[];
  story_lines: StartStoryLineCandidate[];
  start_points: StartStoryPointCandidate[];
};

export type StartStoryRefinePayload = {
  source_synopsis: string;
  title?: string | null;
  tone?: string | null;
  avoid?: string | null;
  preferred_user_role?: string | null;
  provider_id?: string | null;
  model_id?: string | null;
  temperature?: number;
  top_p?: number | null;
  reasoning_effort?: StartStoryReasoningEffort | null;
  feedback: string;
  current_project_title?: string | null;
  current_understood_synopsis?: string | null;
  current_emotional_core?: string | null;
  current_questions: StartStoryQuestion[];
  current_memory_items: StartStoryMemoryCandidate[];
  current_story_lines: StartStoryLineCandidate[];
  current_start_points: StartStoryPointCandidate[];
};

export type StartStoryConfirmPayload = {
  source_synopsis: string;
  project_title: string;
  understood_synopsis?: string | null;
  provider_id?: string | null;
  model_id?: string | null;
  expansion_policy: StartStoryExpansionPolicy;
  memory_items: StartStoryMemoryCandidate[];
  story_lines: StartStoryLineCandidate[];
  selected_start_point?: StartStoryPointCandidate | null;
  skip_start_point: boolean;
};

export type StartStoryConfirmResponse = {
  project: Project;
  created_memory_items: StartStoryMemoryCandidate[];
  created_story_lines: StartStoryLineCandidate[];
  initial_chapter: {
    id: string;
    project_id: string;
    title: string;
    order_index: number;
    status: string;
    synopsis: string | null;
    draft_markdown: string;
    final_markdown: string;
    session_id: string | null;
    created_at: string;
    updated_at: string;
  } | null;
  start_points: StartStoryPointCandidate[];
};

export type ProjectSettings = {
  genre: string | null;
  tone: string | null;
  setting: string | null;
  format: string | null;
  live_mode_recommended: boolean;
  settings: Record<string, unknown>;
};

export type ProjectWorkspaceProject = Project & {
  description: string | null;
  provider_id: string | null;
  model_id: string | null;
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
  title: string;
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
  target_type: "chapter" | "scene" | "event" | "world";
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
  project: ProjectWorkspaceProject;
  settings: WorkspaceSettings;
  idea_lab: IdeaLab;
  world_bible: WorldBible;
  plot_board: PlotBoard;
  canon: CanonWorkspace;
};

export type ProjectWorkspacePayload = Omit<ProjectWorkspace, "project"> & {
  title: string;
  description?: string | null;
  synopsis?: string | null;
  provider_id?: string | null;
  model_id?: string | null;
};

export type ChapterEditorState = {
  project: ProjectWorkspaceProject;
  settings: WorkspaceSettings;
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
