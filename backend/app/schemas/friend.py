import uuid
from datetime import datetime
from pydantic import BaseModel, Field
from app.schemas.user import UserPublic


class FriendRequestCreate(BaseModel):
    username: str = Field(..., min_length=2, max_length=32)


class FriendRequestResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    from_user_id: uuid.UUID
    to_user_id: uuid.UUID
    status: str
    created_at: datetime
    from_user: UserPublic
    to_user: UserPublic


class FriendResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    username: str
    display_name: str | None
    avatar_url: str | None
    status: str
    custom_status: str | None
