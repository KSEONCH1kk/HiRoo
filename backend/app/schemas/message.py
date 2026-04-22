import uuid
from datetime import datetime
from pydantic import BaseModel, Field, field_validator
from app.schemas.user import UserPublic


def _validate_http_url(v: str | None) -> str | None:
    if v is None or v == "":
        return v
    low = v.strip().lower()
    if not (low.startswith("http://") or low.startswith("https://")):
        raise ValueError("URL must start with http:// or https://")
    return v


class MessageCreate(BaseModel):
    content: str = Field("", max_length=4000)
    reply_to_id: uuid.UUID | None = None
    embeds: list["Embed"] | None = None
    components: list[dict] | None = None


class MessageUpdate(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)


class ReactionCreate(BaseModel):
    emoji: str = Field(..., min_length=1, max_length=32)


class ReactionResponse(BaseModel):
    emoji: str
    count: int
    me: bool


class ReplyPreview(BaseModel):
    id: uuid.UUID
    author: UserPublic | None = None
    content: str
    is_deleted: bool = False


class EmbedAuthor(BaseModel):
    name: str = Field(..., max_length=120)
    url: str | None = Field(None, max_length=500)
    icon_url: str | None = Field(None, max_length=500)

    @field_validator("url", "icon_url")
    @classmethod
    def _v_url(cls, v):
        return _validate_http_url(v)


class EmbedFooter(BaseModel):
    text: str = Field(..., max_length=200)
    icon_url: str | None = Field(None, max_length=500)

    @field_validator("icon_url")
    @classmethod
    def _v_url(cls, v):
        return _validate_http_url(v)


class EmbedImage(BaseModel):
    url: str = Field(..., max_length=500)

    @field_validator("url")
    @classmethod
    def _v_url(cls, v):
        return _validate_http_url(v)


class EmbedField(BaseModel):
    name: str = Field(..., max_length=80)
    value: str = Field(..., max_length=1024)
    inline: bool = False


class Embed(BaseModel):
    title: str | None = Field(None, max_length=200)
    description: str | None = Field(None, max_length=2000)
    url: str | None = Field(None, max_length=500)
    color: int | None = Field(None, ge=0, le=0xFFFFFF)
    timestamp: datetime | None = None
    author: EmbedAuthor | None = None
    footer: EmbedFooter | None = None
    image: EmbedImage | None = None
    thumbnail: EmbedImage | None = None
    fields: list[EmbedField] | None = Field(None, max_length=25)

    @field_validator("url")
    @classmethod
    def _v_url(cls, v):
        return _validate_http_url(v)


class MessageResponse(BaseModel):
    id: uuid.UUID
    channel_id: uuid.UUID
    author_id: uuid.UUID | None
    content: str
    reply_to_id: uuid.UUID | None
    reply_to: ReplyPreview | None = None
    edited_at: datetime | None
    is_deleted: bool
    created_at: datetime
    author: UserPublic | None
    reactions: list[ReactionResponse] = []
    webhook_id: uuid.UUID | None = None
    webhook_name: str | None = None
    webhook_avatar_url: str | None = None
    embeds: list[Embed] | None = None
    components: list[dict] | None = None
    application_id: uuid.UUID | None = None


class DMMessageCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)
    reply_to_id: uuid.UUID | None = None


class DMMessageResponse(BaseModel):
    id: uuid.UUID
    dm_id: uuid.UUID
    author_id: uuid.UUID | None
    type: str = "text"
    content: str
    reply_to_id: uuid.UUID | None = None
    reply_to: ReplyPreview | None = None
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
