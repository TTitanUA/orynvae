from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator, model_validator

ProviderType = Literal["lmstudio", "ollama", "openai", "openrouter", "custom_openai"]
OpenRouterSortMode = Literal["price", "throughput", "latency"]
OpenRouterSortPartition = Literal["model", "none"]
OpenRouterDataCollection = Literal["allow", "deny"]
OpenRouterQuantization = Literal[
    "int4",
    "int8",
    "fp4",
    "fp6",
    "fp8",
    "fp16",
    "bf16",
    "fp32",
    "unknown",
]


class ProviderDefaults(BaseModel):
    type: ProviderType
    label: str
    base_url: str
    models_path: str
    chat_path: str
    is_local: bool
    is_external: bool
    requires_api_key: bool
    supports_model_listing: bool


class ProviderCreate(BaseModel):
    type: ProviderType
    name: str = Field(min_length=1, max_length=80)
    base_url: str | None = None
    api_key: str | None = None
    is_local: bool | None = None
    is_enabled: bool = True
    is_default: bool = False
    streaming_enabled: bool = True
    models_path: str | None = None
    chat_path: str | None = None
    default_model_id: str | None = None


class ProviderUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    base_url: str | None = None
    api_key: str | None = None
    is_local: bool | None = None
    is_enabled: bool | None = None
    streaming_enabled: bool | None = None
    models_path: str | None = None
    chat_path: str | None = None
    default_model_id: str | None = None


class ProviderRecord(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    type: ProviderType
    name: str
    base_url: str
    has_api_key: bool
    is_local: bool
    is_external: bool
    is_enabled: bool
    is_default: bool
    streaming_enabled: bool
    models_path: str | None
    chat_path: str | None
    default_model_id: str | None
    last_checked_at: str | None
    last_error: str | None
    created_at: str
    updated_at: str


def _strip_empty(value: object) -> object | None:
    if isinstance(value, dict):
        cleaned = {
            key: cleaned_value
            for key, item in value.items()
            if (cleaned_value := _strip_empty(item)) is not None
        }
        return cleaned or None
    if isinstance(value, list):
        cleaned_list = [
            cleaned_item
            for item in value
            if (cleaned_item := _strip_empty(item)) is not None
        ]
        return cleaned_list or None
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    return value


class OpenRouterSort(BaseModel):
    model_config = ConfigDict(extra="forbid")

    by: OpenRouterSortMode
    partition: OpenRouterSortPartition | None = None


class OpenRouterPercentilePreference(BaseModel):
    model_config = ConfigDict(extra="forbid")

    p50: float | None = Field(default=None, ge=0)
    p75: float | None = Field(default=None, ge=0)
    p90: float | None = Field(default=None, ge=0)
    p99: float | None = Field(default=None, ge=0)


class OpenRouterMaxPrice(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: float | None = Field(default=None, ge=0)
    completion: float | None = Field(default=None, ge=0)


class OpenRouterRoutingConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    order: list[str] = Field(default_factory=list)
    allow_fallbacks: bool | None = None
    require_parameters: bool | None = None
    data_collection: OpenRouterDataCollection | None = None
    zdr: bool | None = None
    enforce_distillable_text: bool | None = None
    only: list[str] = Field(default_factory=list)
    ignore: list[str] = Field(default_factory=list)
    quantizations: list[OpenRouterQuantization] = Field(default_factory=list)
    sort: OpenRouterSortMode | OpenRouterSort | None = None
    preferred_min_throughput: float | OpenRouterPercentilePreference | None = None
    preferred_max_latency: float | OpenRouterPercentilePreference | None = None
    max_price: OpenRouterMaxPrice | None = None

    @field_validator("order", "only", "ignore", mode="before")
    @classmethod
    def _clean_string_list(cls, value: object) -> object:
        if value is None:
            return []
        if not isinstance(value, list):
            return value
        return [item.strip() for item in value if isinstance(item, str) and item.strip()]

    def to_provider_payload(self) -> dict[str, object]:
        raw = self.model_dump(mode="json", exclude_none=True)
        cleaned = _strip_empty(raw)
        return cleaned if isinstance(cleaned, dict) else {}


class ProviderModelRecord(BaseModel):
    id: str
    provider_id: str
    model_id: str
    display_name: str
    supports_streaming: bool
    context_window: int | None
    capabilities: dict[str, object]
    is_allowed: bool
    routing_config: dict[str, object] | None
    last_seen_at: str | None
    created_at: str
    updated_at: str


class ProviderWithModels(ProviderRecord):
    models: list[ProviderModelRecord]


class ProviderModelPreference(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model_id: str = Field(min_length=1)
    is_allowed: bool = False
    routing_config: OpenRouterRoutingConfig | None = None


class ProviderModelPreferencesUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    default_model_id: str | None = None
    models: list[ProviderModelPreference] = Field(default_factory=list)

    @field_validator("default_model_id", mode="before")
    @classmethod
    def _empty_default_to_none(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @model_validator(mode="after")
    def _reject_duplicate_models(self) -> "ProviderModelPreferencesUpdate":
        model_ids = [item.model_id for item in self.models]
        if len(model_ids) != len(set(model_ids)):
            raise ValueError("Model preferences contain duplicate model IDs")
        return self


class ProviderTestRequest(BaseModel):
    model_id: str | None = None
    prompt: str | None = Field(default=None, max_length=500)


class ProviderTestResponse(BaseModel):
    ok: bool
    message: str
    latency_ms: int
    models: list[ProviderModelRecord] = Field(default_factory=list)
    sample: str | None = None


class ProviderModelRefreshResponse(BaseModel):
    provider_id: str
    models: list[ProviderModelRecord]
    message: str


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=1)


class ProviderChatRequest(BaseModel):
    model_id: str
    messages: list[ChatMessage] = Field(min_length=1)
    temperature: float = Field(default=0.7, ge=0, le=2)
    stream: bool = True


class ProviderReference(BaseModel):
    provider_id: str
    model_id: str
    provider_name: str
    provider_type: ProviderType
    is_external: bool


class UrlCheck(BaseModel):
    url: HttpUrl
