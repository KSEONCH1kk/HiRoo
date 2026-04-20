import uuid
from datetime import datetime
from pydantic import BaseModel
from app.schemas.user import UserPublic


class NotificationResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    kind: str
    content: str | None
    is_read: bool
    created_at: datetime
    from_user: UserPublic | None
    server_id: uuid.UUID | None
    channel_id: uuid.UUID | None


class VoiceJoin(BaseModel):
    channel_id: uuid.UUID


class VoiceStateUpdate(BaseModel):
    is_muted: bool | None = None
    is_deafened: bool | None = None
    is_sharing_screen: bool | None = None
    is_video: bool | None = None


class VoiceStateResponse(BaseModel):
    model_config = {"from_attributes": True}

    user_id: uuid.UUID
    channel_id: uuid.UUID | None
    server_id: uuid.UUID | None
    is_muted: bool
    is_deafened: bool
    is_sharing_screen: bool
    is_video: bool
