export type Chapter = {
  id: string;
  project_id: string;
  title: string;
  order_index: number;
  status: "planned" | "in_session" | "session_done" | "draft_generated" | "reviewing" | "completed";
  synopsis: string | null;
  draft_markdown: string;
  final_markdown: string;
  session_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ChapterCreatePayload = {
  title?: string | null;
  order_index?: number | null;
  synopsis?: string | null;
};

export type ChapterUpdatePayload = {
  title?: string | null;
  order_index?: number | null;
  status?: Chapter["status"];
  synopsis?: string | null;
};

export type ChapterUserRole = "single_character" | "multiple_characters" | "author" | "unknown";
export type ChapterPace = "slow" | "medium" | "fast" | "user_choice";
export type ChapterReasoningEffort = "low" | "medium" | "high";

export type ChapterSession = {
  id: string;
  project_id: string;
  chapter_id: string | null;
  status: "preparing" | "active" | "paused" | "completed" | "draft_ready" | "reviewed";
  user_role: string | null;
  controlled_character_ids: string[];
  active_story_line_ids: string[];
  tone: string | null;
  pace: string | null;
  expansion_policy_override: string | null;
  agent_instructions: string | null;
  agent_temperature: number | null;
  agent_top_p: number | null;
  agent_reasoning_effort: ChapterReasoningEffort | null;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SessionTurn = {
  id: string;
  session_id: string;
  turn_index: number;
  actor_type: "ai" | "user" | "system";
  turn_type: "narration" | "action" | "dialogue" | "author_command" | "choice" | "note" | "summary";
  content: string;
  related_memory_item_ids: string[];
  related_story_line_ids: string[];
  is_key_event: boolean;
  exclude_from_draft: boolean;
  created_at: string;
};

export type ChapterSuggestedAction = {
  label: string;
  action: string;
  tone: string | null;
};

export type ChapterPreparePayload = {
  title?: string | null;
  focus?: string | null;
  user_role: ChapterUserRole;
  controlled_character_ids: string[];
  primary_story_line_id?: string | null;
  secondary_story_line_ids: string[];
  ignored_story_line_ids?: string[];
  tone?: string | null;
  pace?: ChapterPace | null;
  expansion_policy_override?: string | null;
  start_point?: string | null;
  provider_id?: string | null;
  model_id?: string | null;
  temperature?: number;
  top_p?: number | null;
  reasoning_effort?: ChapterReasoningEffort | null;
};

export type ChapterPrepareResult = {
  chapter: Chapter;
  session: ChapterSession;
  opening_turn: SessionTurn | null;
  narrator_opening: string;
  suggested_actions: ChapterSuggestedAction[];
  relevant_memory_titles: string[];
  warnings: string[];
  chapter_intention: string | null;
  start_situation: string | null;
  participant_titles: string[];
  possible_line_movements: string[];
  coherence_risks: string[];
};
