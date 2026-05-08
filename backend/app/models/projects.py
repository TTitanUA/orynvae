from pydantic import BaseModel, ConfigDict, Field


class ProjectRecord(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    synopsis: str
    status: str
    active_provider_id: str | None = None
    active_model_id: str | None = None
    expansion_policy: str
    created_at: str
    updated_at: str
    archived_at: str | None = None


class ProjectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    synopsis: str = ""
    status: str = Field(default="active", min_length=1, max_length=40)
    active_provider_id: str | None = None
    active_model_id: str | None = None
    expansion_policy: str = Field(default="ask", min_length=1, max_length=80)


class ProjectUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    synopsis: str | None = None
    status: str | None = Field(default=None, min_length=1, max_length=40)
    active_provider_id: str | None = None
    active_model_id: str | None = None
    expansion_policy: str | None = Field(default=None, min_length=1, max_length=80)
