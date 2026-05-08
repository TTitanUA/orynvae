export type StoryLineType = "character" | "mystery" | "relationship" | "threat" | "theme" | "custom";

export type StoryLineStatus = "proposed" | "active" | "sleeping" | "completed" | "rejected";
export type StoryLineReasoningEffort = "low" | "medium" | "high";

export type StoryLine = {
  id: string;
  project_id: string;
  type: StoryLineType;
  title: string;
  description: string | null;
  current_state: string | null;
  status: StoryLineStatus;
  priority: number;
  last_progress_chapter_id: string | null;
  created_at: string;
  updated_at: string;
};

export type StoryLineCreatePayload = {
  type: StoryLineType;
  title: string;
  description?: string | null;
  current_state?: string | null;
  status?: StoryLineStatus;
  priority?: number;
  last_progress_chapter_id?: string | null;
};

export type StoryLineUpdatePayload = Partial<StoryLineCreatePayload>;

export type StoryLineFilters = {
  type?: StoryLineType | "";
  status?: StoryLineStatus | "";
  search?: string;
};

export type StoryLineProgress = {
  id: string;
  project_id: string;
  story_line_id: string;
  chapter_id: string | null;
  session_id: string | null;
  before_state: string | null;
  after_state: string | null;
  event_summary: string | null;
  created_at: string;
};

export type StoryLineProgressResult = {
  story_line: StoryLine;
  progress: StoryLineProgress[];
};

export type StoryLineSuggestion = {
  type: StoryLineType;
  title: string;
  description: string | null;
  current_state: string | null;
  priority: number;
  reason: string | null;
};

export type StoryLineSuggestPayload = {
  instructions?: string | null;
  max_suggestions?: number;
  provider_id?: string | null;
  model_id?: string | null;
  temperature?: number;
  top_p?: number | null;
  reasoning_effort?: StoryLineReasoningEffort | null;
};

export type StoryLineSuggestResult = {
  story_lines: StoryLineSuggestion[];
  warnings: string[];
};
