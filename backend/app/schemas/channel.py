import uuid
from datetime import datetime
from pydantic import BaseModel, Field


class ChannelCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9\-_а-яА-ЯёЁ ]+$")
    type: str = Field("text", pattern=r"^(text|voice|announcement|category|forum)$")
    topic: str | None = Field(None, max_length=1024)
    is_private: bool = False
    position: int = Field(0, ge=0)
    parent_id: uuid.UUID | None = None


class ChannelUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    topic: str | None = Field(None, max_length=1024)
    slowmode_seconds: int | None = Field(None, ge=0, le=21600)
    # Pass null explicitly to detach from category.
    parent_id: uuid.UUID | None = None


class ChannelReorderItem(BaseModel):
    id: uuid.UUID
    position: int
    parent_id: uuid.UUID | None = None


class ChannelResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    server_id: uuid.UUID
    name: str
    type: str
    position: int
    topic: str | None
    is_private: bool
    slowmode_seconds: int
    parent_id: uuid.UUID | None = None
    created_at: datetime
