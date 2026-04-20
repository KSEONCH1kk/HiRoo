import uuid
from datetime import datetime
from pydantic import BaseModel, Field
from app.schemas.user import UserPublic


class MessageCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)
    reply_to_id: uuid.UUID | None = None


class MessageUpdate(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)


class ReactionCreate(BaseModel):
    emoji: str = Field(..., min_length=1, max_length=32)


class ReactionResponse(BaseModel):
    emoji: str
    count: int
    me: bool


class MessageResponse(BaseModel):
    id: uuid.UUID
    channel_id: uuid.UUID
    author_id: uuid.UUID | None
    content: str
    reply_to_id: uuid.UUID | None
    edited_at: datetime | None
    is_deleted: bool
    created_at: datetime
    author: UserPublic | None
    reactions: list[ReactionResponse] = []


class DMMessageCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)


class DMMessageResponse(BaseModel):
    id: uuid.UUID
    dm_id: uuid.UUID
    author_id: uuid.UUID | None
    content: str
    edited_at: datetime | None
    is_deleted: bool
    created_at: datetime
    author: UserPublic | None
    reactions: list[ReactionResponse] = []


class PaginatedMessages(BaseModel):
    items: list[MessageResponse]
    has_more: bool
    next_cursor: str | None


class PaginatedDMMessages(BaseModel):
    items: list[DMMessageResponse]
    has_more: bool
    next_cursor: str | None
