import uuid
from datetime import datetime
from pydantic import BaseModel, Field
from app.schemas.user import UserPublic


class DMCreate(BaseModel):
    user_ids: list[uuid.UUID] = Field(..., min_length=1, max_length=9)
    name: str | None = Field(None, max_length=100)


class DMParticipantResponse(BaseModel):
    model_config = {"from_attributes": True}

    user_id: uuid.UUID
    joined_at: datetime
    user: UserPublic


class DMResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    is_group: bool
    name: str | None
    icon_url: str | None = None
    owner_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime
    participants: list[DMParticipantResponse] = []
    last_message: str | None = None
