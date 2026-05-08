export type RuntimeProviderReference = {
  id: string;
  type: string;
  name: string;
  is_external: boolean;
  is_enabled: boolean;
  last_checked_at: string | null;
  last_error: string | null;
};

export type RuntimeModelReference = {
  id: string;
  provider_id: string;
  model_id: string;
  display_name: string;
  supports_streaming: boolean;
  is_allowed: boolean;
};

export type RuntimeStatus = {
  read_only: boolean;
  ai_available: boolean;
  reason: string | null;
  active_provider: RuntimeProviderReference | null;
  active_model: RuntimeModelReference | null;
};
