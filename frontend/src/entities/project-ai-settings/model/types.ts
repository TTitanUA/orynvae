import type { ProviderModel, ProviderType } from "../../provider";
import type { RuntimeStatus } from "../../runtime";

export type ProjectAgentKey =
  | "start_story_interviewer"
  | "story_line_generator"
  | "chapter_preparer"
  | "narrator"
  | "narrator_action_variants"
  | "draft_assembler"
  | "draft_fragment_editor"
  | "chapter_reviewer"
  | "forecaster"
  | "contradiction_checker"
  | "session_summarizer";

export type ProjectAgentSettingSource = "project" | "agent_default" | "custom";

export type ProjectAiSettingsProvider = {
  id: string;
  type: ProviderType;
  name: string;
  base_url: string;
  has_api_key: boolean;
  is_local: boolean;
  is_external: boolean;
  is_enabled: boolean;
  is_default: boolean;
  streaming_enabled: boolean;
  models_path: string | null;
  chat_path: string | null;
  default_model_id: string | null;
  last_checked_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectAgentSettings = {
  agent_key: ProjectAgentKey;
  label: string;
  temperature_source: ProjectAgentSettingSource;
  temperature_value: number | null;
  effective_temperature: number;
  preset_temperature: number | null;
  top_p_source: ProjectAgentSettingSource;
  top_p_value: number | null;
  effective_top_p: number | null;
  preset_top_p: number | null;
};

export type ProjectAiSettings = {
  project_id: string;
  active_provider_id: string | null;
  active_model_id: string | null;
  default_temperature: number;
  default_top_p: number;
  runtime: RuntimeStatus;
  active_provider: ProjectAiSettingsProvider | null;
  active_model: ProviderModel | null;
  agents: ProjectAgentSettings[];
  warnings: string[];
};

export type ProjectAgentSettingsPatch = {
  agent_key: ProjectAgentKey;
  temperature_source?: ProjectAgentSettingSource;
  temperature_value?: number | null;
  top_p_source?: ProjectAgentSettingSource;
  top_p_value?: number | null;
};

export type ProjectAiSettingsPatch = {
  active_provider_id?: string | null;
  active_model_id?: string | null;
  default_temperature?: number;
  default_top_p?: number;
  agents?: ProjectAgentSettingsPatch[];
};
