from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

ProviderType = Literal["lmstudio", "ollama", "openai", "openrouter", "custom_openai"]


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


class ProviderModelRecord(BaseModel):
    id: str
    provider_id: str
    model_id: str
    display_name: str
    supports_streaming: bool
    context_window: int | None
    capabilities: dict[str, object]
    last_seen_at: str | None
    created_at: str
    updated_at: str


class ProviderWithModels(ProviderRecord):
    models: list[ProviderModelRecord]


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


class ProjectModelSelection(BaseModel):
    project_id: str
    provider_id: str
    model_id: str


class ProviderReference(BaseModel):
    provider_id: str
    model_id: str
    provider_name: str
    provider_type: ProviderType
    is_external: bool


class UrlCheck(BaseModel):
    url: HttpUrl
