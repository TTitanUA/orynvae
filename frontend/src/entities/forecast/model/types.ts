export type ForecastReasoningEffort = "low" | "medium" | "high";

export type ForecastOption = {
  id: string;
  forecast_id: string;
  title: string;
  description: string | null;
  likely_consequences: string[];
  related_story_line_ids: string[];
  risks: string[];
  is_selected_as_orientation: boolean;
};

export type Forecast = {
  id: string;
  project_id: string;
  source_chapter_id: string | null;
  summary: string | null;
  status: string;
  created_at: string;
  options: ForecastOption[];
};

export type ForecastListResponse = {
  forecasts: Forecast[];
};

export type ForecastGeneratePayload = {
  source_chapter_id: string;
  horizon_chapters: number;
  active_story_line_ids: string[];
  provider_id?: string | null;
  model_id?: string | null;
  temperature?: number;
  top_p?: number | null;
  reasoning_effort?: ForecastReasoningEffort | null;
};
