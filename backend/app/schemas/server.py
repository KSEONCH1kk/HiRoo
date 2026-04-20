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


class ServerResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    description: str | None
    icon_url: str | None
    owner_id: uuid.UUID
    invite_code: str
    is_discoverable: bool = False
    created_at: datetime
    member_count: int = 0


class InviteResponse(BaseModel):
    invite_code: str
    expires_at: datetime | None
