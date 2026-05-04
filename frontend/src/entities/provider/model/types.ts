export type ProviderType = "lmstudio" | "ollama" | "openai" | "openrouter" | "custom_openai";

export type ProviderDefaults = {
  type: ProviderType;
  label: string;
  base_url: string;
  models_path: string;
  chat_path: string;
  is_local: boolean;
  is_external: boolean;
  requires_api_key: boolean;
  supports_model_listing: boolean;
};

export type ProviderModel = {
  id: string;
  provider_id: string;
  model_id: string;
  display_name: string;
  supports_streaming: boolean;
  context_window: number | null;
  capabilities: Record<string, unknown>;
  is_allowed: boolean;
  routing_config: OpenRouterRoutingConfig | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Provider = {
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
  models: ProviderModel[];
};

export type ProviderCreatePayload = {
  type: ProviderType;
  name: string;
  base_url?: string;
  api_key?: string;
  is_local?: boolean;
  is_enabled?: boolean;
  is_default?: boolean;
  streaming_enabled: boolean;
  models_path?: string;
  chat_path?: string;
};

export type ProviderUpdatePayload = {
  name?: string;
  base_url?: string | null;
  api_key?: string | null;
  is_local?: boolean;
  is_enabled?: boolean;
  streaming_enabled?: boolean;
  models_path?: string | null;
  chat_path?: string | null;
  default_model_id?: string | null;
};

export type ProviderTestResponse = {
  ok: boolean;
  message: string;
  latency_ms: number;
  models: ProviderModel[];
  sample: string | null;
};

export type ProviderModelRefreshResponse = {
  provider_id: string;
  models: ProviderModel[];
  message: string;
};

export type OpenRouterSortMode = "price" | "throughput" | "latency";
export type OpenRouterSortPartition = "model" | "none";
export type OpenRouterDataCollection = "allow" | "deny";
export type OpenRouterQuantization =
  | "int4"
  | "int8"
  | "fp4"
  | "fp6"
  | "fp8"
  | "fp16"
  | "bf16"
  | "fp32"
  | "unknown";

export type OpenRouterPercentilePreference = Partial<
  Record<"p50" | "p75" | "p90" | "p99", number>
>;

export type OpenRouterRoutingConfig = {
  order?: string[];
  allow_fallbacks?: boolean;
  require_parameters?: boolean;
  data_collection?: OpenRouterDataCollection;
  zdr?: boolean;
  enforce_distillable_text?: boolean;
  only?: string[];
  ignore?: string[];
  quantizations?: OpenRouterQuantization[];
  sort?: OpenRouterSortMode | { by: OpenRouterSortMode; partition?: OpenRouterSortPartition };
  preferred_min_throughput?: number | OpenRouterPercentilePreference;
  preferred_max_latency?: number | OpenRouterPercentilePreference;
  max_price?: {
    prompt?: number;
    completion?: number;
  };
};

export type ProviderModelPreferencePayload = {
  model_id: string;
  is_allowed: boolean;
  routing_config?: OpenRouterRoutingConfig | null;
};

export type ProviderModelPreferencesUpdatePayload = {
  default_model_id: string | null;
  models: ProviderModelPreferencePayload[];
};
