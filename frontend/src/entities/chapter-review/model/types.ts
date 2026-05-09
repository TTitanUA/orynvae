import type { Chapter, ChapterSession } from "../../chapter";
import type { DraftVersion } from "../../draft";
import type { MemoryItemStatus, MemoryProposal } from "../../memory";
import type { Project } from "../../project/model/types";
import type { StoryLineStatus } from "../../story-line";

export type ChapterReviewStatus = "pending" | "applied";
export type ChapterReviewLineUpdateStatus = "pending" | "accepted" | "rejected" | "deferred";
export type ChapterReviewNoteType = "contradiction" | "open_question";
export type ChapterReviewNoteStatus = "pending" | "resolved" | "rejected" | "deferred";
export type ChapterReviewDecisionStatus = "accepted" | "edited" | "rejected" | "deferred";
export type ChapterReviewReasoningEffort = "low" | "medium" | "high";

export type ChapterReview = {
  id: string;
  project_id: string;
  chapter_id: string;
  source_session_id: string | null;
  source_draft_version_id: string | null;
  summary: string;
  status: ChapterReviewStatus;
  warnings: string[];
  created_at: string;
  updated_at: string;
};

export type ChapterReviewStoryLineUpdate = {
  id: string;
  review_id: string;
  project_id: string;
  target_story_line_id: string | null;
  title: string;
  before_state: string | null;
  after_state: string;
  event_summary: string | null;
  reason: string | null;
  status: ChapterReviewLineUpdateStatus;
  created_at: string;
};

export type ChapterReviewNote = {
  id: string;
  review_id: string;
  project_id: string;
  note_type: ChapterReviewNoteType;
  title: string;
  body: Record<string, unknown>;
  severity: "low" | "medium" | "high" | null;
  status: ChapterReviewNoteStatus;
  decision_note: string | null;
  created_at: string;
};

export type ChapterReviewGeneratePayload = {
  source_draft_version_id?: string | null;
  provider_id?: string | null;
  model_id?: string | null;
  temperature?: number;
  top_p?: number | null;
  reasoning_effort?: ChapterReviewReasoningEffort | null;
};

export type ChapterReviewResponse = {
  project: Project;
  chapter: Chapter;
  session: ChapterSession | null;
  draft_version: DraftVersion | null;
  review: ChapterReview;
  memory_proposals: MemoryProposal[];
  story_line_updates: ChapterReviewStoryLineUpdate[];
  notes: ChapterReviewNote[];
  warnings: string[];
};

export type ChapterReviewMemoryDecision = {
  proposal_id: string;
  status: ChapterReviewDecisionStatus;
  suggested_payload?: Record<string, unknown> | null;
  target_status?: MemoryItemStatus;
};

export type ChapterReviewStoryLineDecision = {
  update_id: string;
  status: "accepted" | "rejected" | "deferred";
  target_story_line_id?: string | null;
  target_status?: StoryLineStatus | null;
};

export type ChapterReviewNoteDecision = {
  note_id: string;
  status: "resolved" | "rejected" | "deferred";
  decision_note?: string | null;
};

export type ChapterReviewApplyPayload = {
  review_id?: string | null;
  memory_decisions?: ChapterReviewMemoryDecision[];
  story_line_decisions?: ChapterReviewStoryLineDecision[];
  note_decisions?: ChapterReviewNoteDecision[];
};
