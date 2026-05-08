from pydantic import BaseModel, ConfigDict


class RuntimeProviderReference(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    type: str
    name: str
    is_external: bool
    is_enabled: bool
    last_checked_at: str | None = None
    last_error: str | None = None


class RuntimeModelReference(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    provider_id: str
    model_id: str
    display_name: str
    supports_streaming: bool
    is_allowed: bool


class RuntimeStatus(BaseModel):
    read_only: bool
    ai_available: bool
    reason: str | None = None
    active_provider: RuntimeProviderReference | None = None
    active_model: RuntimeModelReference | None = None
