import type { Chapter, ChapterSession } from "../../chapter";
import type { Project } from "../../project/model/types";

export type DraftMode =
  | "faithful"
  | "literary"
  | "shorter"
  | "expanded"
  | "dialogue_focus"
  | "atmosphere_focus";

export type DraftStatus = "generated" | "edited" | "accepted";
export type DraftReasoningEffort = "low" | "medium" | "high";

export type DraftVersion = {
  id: string;
  project_id: string;
  chapter_id: string;
  source_session_id: string | null;
  mode: DraftMode;
  markdown: string;
  status: DraftStatus;
  created_at: string;
};

export type DraftAssemblyPayload = {
  mode: DraftMode;
  required_event_ids: string[];
  excluded_turn_ids: string[];
  style_notes?: string | null;
  provider_id?: string | null;
  model_id?: string | null;
  temperature?: number;
  top_p?: number | null;
  reasoning_effort?: DraftReasoningEffort | null;
};

export type DraftAssemblyResponse = {
  project: Project;
  chapter: Chapter;
  session: ChapterSession;
  draft_version: DraftVersion;
  warnings: string[];
};

export type DraftUpdatePayload = {
  markdown: string;
  status?: DraftStatus;
  mode?: DraftMode;
};

export type DraftUpdateResponse = {
  chapter: Chapter;
  draft_version: DraftVersion;
};

export type DraftAssistPayload = {
  selection_markdown: string;
  instructions: string;
  provider_id?: string | null;
  model_id?: string | null;
  temperature?: number;
  top_p?: number | null;
  reasoning_effort?: DraftReasoningEffort | null;
};

export type DraftAssistResponse = {
  replacement_markdown: string;
  rationale: string | null;
  warnings: string[];
};
