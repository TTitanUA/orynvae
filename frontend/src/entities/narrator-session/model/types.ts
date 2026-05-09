import type { Chapter, ChapterSession, SessionTurn } from "../../chapter";
import type { MemoryProposal } from "../../memory";
import type { Project } from "../../project/model/types";

export type NarratorInputType = "action" | "dialogue" | "author_command" | "choice" | "note";
export type NarratorReasoningEffort = "low" | "medium" | "high";

export type SessionSuggestedActionStatus = "suggested" | "selected" | "dismissed";

export type SessionSuggestedAction = {
  id: string;
  session_id: string;
  source_turn_id: string | null;
  action_index: number;
  label: string;
  action: string;
  tone: string | null;
  status: SessionSuggestedActionStatus;
  selected_turn_id: string | null;
  created_at: string;
};

export type KeyEvent = {
  id: string;
  project_id: string;
  session_id: string;
  chapter_id: string | null;
  source_turn_id: string | null;
  title: string;
  summary: string | null;
  consequences: string | null;
  related_memory_item_ids: string[];
  related_story_line_ids: string[];
  include_in_draft: boolean;
  created_at: string;
};

export type StoryLineUpdateCandidate = {
  title: string;
  before_state: string | null;
  after_state: string;
  event_summary: string | null;
  reason: string | null;
};

export type NarratorSessionDetail = {
  project: Project;
  chapter: Chapter | null;
  session: ChapterSession;
  turns: SessionTurn[];
  suggested_actions: SessionSuggestedAction[];
  key_events: KeyEvent[];
  memory_proposals: MemoryProposal[];
  warnings: string[];
};

export type NarratorSessionLog = {
  project: Project;
  chapter: Chapter | null;
  session: ChapterSession;
  turns: SessionTurn[];
  suggested_actions: SessionSuggestedAction[];
  key_events: KeyEvent[];
  memory_proposals: MemoryProposal[];
};

export type NarratorTurnPayload = {
  input_type: NarratorInputType;
  content?: string | null;
  selected_option_id?: string | null;
  provider_id?: string | null;
  model_id?: string | null;
  temperature?: number;
  top_p?: number | null;
  reasoning_effort?: NarratorReasoningEffort | null;
};

export type NarratorAgentSettingsPayload = {
  agent_instructions?: string | null;
  agent_temperature?: number | null;
  agent_top_p?: number | null;
  agent_reasoning_effort?: NarratorReasoningEffort | null;
};

export type NarratorRegeneratePayload = {
  comment?: string | null;
};

export type NarratorSuggestedActionsRegeneratePayload = {
  source_turn_id?: string | null;
  prompt?: string | null;
  comment?: string | null;
  provider_id?: string | null;
  model_id?: string | null;
  temperature?: number | null;
  top_p?: number | null;
  reasoning_effort?: NarratorReasoningEffort | null;
};

export type NarratorSuggestedActionsResponse = {
  session: ChapterSession;
  source_turn: SessionTurn;
  suggested_actions: SessionSuggestedAction[];
  warnings: string[];
};

export type NarratorRollbackPayload = {
  target_turn_id: string;
  user_turn_mode?: "keep" | "redo";
  comment?: string | null;
};

export type NarratorTurnResponse = {
  session: ChapterSession;
  user_turn: SessionTurn;
  ai_turn: SessionTurn;
  suggested_actions: SessionSuggestedAction[];
  key_event_candidates: KeyEvent[];
  memory_proposal_candidates: MemoryProposal[];
  story_line_update_candidates: StoryLineUpdateCandidate[];
  warnings: string[];
};

export type NarratorTurnFlagPayload = {
  is_key_event?: boolean | null;
  exclude_from_draft?: boolean | null;
};

export type NarratorKeyEventUpdatePayload = {
  title?: string | null;
  summary?: string | null;
  consequences?: string | null;
  related_memory_item_ids?: string[] | null;
  related_story_line_ids?: string[] | null;
  include_in_draft?: boolean | null;
};
