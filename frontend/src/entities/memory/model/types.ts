import type { Project } from "../../project/model/types";
import type { RuntimeStatus } from "../../runtime/model/types";

export type MemoryItemType =
  | "character"
  | "location"
  | "item"
  | "group"
  | "world_rule"
  | "mystery"
  | "event"
  | "canon_fact"
  | "note";

export type MemoryItemStatus = "proposed" | "draft" | "canon" | "rejected" | "outdated";
export type MemoryProposalStatus = "pending" | "accepted" | "edited" | "rejected" | "deferred";

export type MemoryItem = {
  id: string;
  project_id: string;
  type: MemoryItemType;
  title: string;
  summary: string | null;
  body: string | null;
  status: MemoryItemStatus;
  source_type: string | null;
  source_id: string | null;
  importance: number;
  created_at: string;
  updated_at: string;
};

export type MemoryItemCreatePayload = {
  type: MemoryItemType;
  title: string;
  summary?: string | null;
  body?: string | null;
  status?: MemoryItemStatus;
  source_type?: string | null;
  source_id?: string | null;
  importance?: number;
};

export type MemoryItemUpdatePayload = Partial<MemoryItemCreatePayload>;

export type MemoryFilters = {
  type?: MemoryItemType | "";
  status?: MemoryItemStatus | "";
  search?: string;
  requires_confirmation?: boolean;
};

export type MemoryProposal = {
  id: string;
  project_id: string;
  proposal_type: string;
  target_item_id: string | null;
  suggested_payload: Record<string, unknown>;
  reason: string | null;
  source_type: string | null;
  source_id: string | null;
  status: MemoryProposalStatus;
  created_at: string;
};

export type MemoryProposalAcceptPayload = {
  suggested_payload?: Record<string, unknown> | null;
  target_status: MemoryItemStatus;
};

export type MemoryProposalRejectPayload = {
  status: "rejected" | "deferred";
};

export type MemoryProposalDecision = {
  proposal: MemoryProposal;
  memory_item: MemoryItem | null;
};

export type MemoryContradictionWarning = {
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
  related_memory_titles: string[];
  suggestion: string | null;
};

export type MemoryConflictCheckPayload = {
  content?: string | null;
  candidate_payload?: Record<string, unknown>;
  target_item_id?: string | null;
};

export type MemoryConflictCheckResult = {
  contradictions: MemoryContradictionWarning[];
  warnings: string[];
};

export type StoryLineSummary = {
  id: string;
  project_id: string;
  type: string;
  title: string;
  description: string | null;
  current_state: string | null;
  status: string;
  priority: number;
  last_progress_chapter_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ChapterSummary = {
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
};

export type ChapterSessionSummary = {
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
  agent_reasoning_effort: "low" | "medium" | "high" | null;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkspaceNextStep = {
  code:
    | "configure_ai"
    | "prepare_first_chapter"
    | "continue_session"
    | "open_session_log"
    | "review_memory"
    | "continue_story";
  label: string;
  detail: string | null;
  href: string | null;
};

export type WorkspaceMemoryCounts = {
  total: number;
  proposed: number;
  draft: number;
  canon: number;
  rejected: number;
  outdated: number;
  pending_proposals: number;
};

export type ProjectWorkspaceSummary = {
  project: Project;
  runtime: RuntimeStatus;
  next_step: WorkspaceNextStep;
  memory_counts: WorkspaceMemoryCounts;
  pending_memory_items: MemoryItem[];
  pending_proposals: MemoryProposal[];
  active_story_lines: StoryLineSummary[];
  planned_chapter: ChapterSummary | null;
  latest_chapter: ChapterSummary | null;
  active_session: ChapterSessionSummary | null;
  warnings: string[];
};
