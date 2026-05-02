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
};

