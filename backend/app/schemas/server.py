import uuid
from datetime import datetime
from pydantic import BaseModel, Field
from app.schemas.user import UserPublic


class ServerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)


class ServerUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    is_discoverable: bool | None = None
    # Passing "" clears the tag; omitting leaves it unchanged.
    tag_label: str | None = Field(None, max_length=8)
    tag_icon: str | None = Field(None, max_length=32)
    # null value explicitly clears the channel, omitting leaves unchanged.
    system_channel_id: uuid.UUID | None = None
    welcome_enabled: bool | None = None
    auto_mod_enabled: bool | None = None
    auto_mod_words: list[str] | None = None
    auto_mod_mention_threshold: int | None = Field(None, ge=0, le=50)
    auto_mod_action: str | None = Field(None, pattern=r"^(delete|timeout)$")
    auto_mod_timeout_seconds: int | None = Field(None, ge=60, le=60 * 60 * 24 * 7)


class ServerMemberUpdate(BaseModel):
    role: str | None = Field(None, pattern=r"^(admin|member)$")
    nickname: str | None = Field(None, max_length=64)


class ServerMemberResponse(BaseModel):
    model_config = {"from_attributes": True}

    user_id: uuid.UUID
    server_id: uuid.UUID
    role: str
    nickname: str | None
    joined_at: datetime
    user: UserPublic
    role_ids: list[uuid.UUID] = []
    timeout_until: datetime | None = None
    timeout_reason: str | None = None


class ServerResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    description: str | None
    icon_url: str | None
    owner_id: uuid.UUID
    invite_code: str
    is_discoverable: bool = False
    tag_label: str | None = None
    tag_icon: str | None = None
    system_channel_id: uuid.UUID | None = None
    welcome_enabled: bool = True
    auto_mod_enabled: bool = False
    auto_mod_words: list[str] = []
    auto_mod_mention_threshold: int = 0
    auto_mod_action: str = "delete"
    auto_mod_timeout_seconds: int = 300
    created_at: datetime
    member_count: int = 0


class InviteResponse(BaseModel):
    invite_code: str
    expires_at: datetime | None
