from pydantic import BaseModel, ConfigDict, Field


class ProjectRecord(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    is_hidden: bool = False
    created_at: str
    updated_at: str
    archived_at: str | None = None


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    is_hidden: bool = False


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    is_hidden: bool | None = None
