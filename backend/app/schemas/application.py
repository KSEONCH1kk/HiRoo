import uuid
from datetime import datetime
from pydantic import BaseModel, Field, HttpUrl, field_validator


# ── Applications ──────────────────────────────────────────────────────────

class ApplicationCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    description: str | None = Field(None, max_length=1000)


class ApplicationUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=80)
    description: str | None = Field(None, max_length=1000)
    redirect_uris: list[str] | None = None
    public_bot: bool | None = None
    supports_commands: bool | None = None
    supports_voice: bool | None = None
    intents: int | None = Field(None, ge=0)

    @field_validator("redirect_uris")
    @classmethod
    def _uris(cls, v):
        if v is None:
            return v
        if len(v) > 10:
            raise ValueError("Максимум 10 redirect URIs")
        for u in v:
            if not isinstance(u, str) or not (u.startswith("http://") or u.startswith("https://")):
                raise ValueError("Redirect URI должен быть http(s)://...")
            if len(u) > 512:
                raise ValueError("Redirect URI слишком длинный")
        return v


class ApplicationResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    description: str | None
    icon_url: str | None
    client_id: str
    redirect_uris: list[str]
    supports_commands: bool
    supports_voice: bool
    is_verified: bool
    intents: int
    public_bot: bool
    created_at: datetime
    has_bot: bool = False


class ApplicationCreateResponse(ApplicationResponse):
    # Returned only once at app creation.
    client_secret: str


# ── Bots ──────────────────────────────────────────────────────────────────

class BotCreateResponse(BaseModel):
    application_id: uuid.UUID
    bot_user_id: uuid.UUID
    token: str               # plain, shown once
    token_suffix: str
    shard_count: int


class BotTokenResetResponse(BaseModel):
    token: str
    token_suffix: str


# ── Commands ──────────────────────────────────────────────────────────────

class CommandOption(BaseModel):
    name: str = Field(..., min_length=1, max_length=32, pattern=r"^[a-z0-9_-]+$")
    description: str = Field(..., max_length=128)
    # 1=subcmd, 2=subcmd_group, 3=string, 4=int, 5=bool, 6=user, 7=channel, 8=role, 10=number
    type: int = Field(..., ge=1, le=10)
    required: bool = False
    choices: list[dict] | None = None
    options: list["CommandOption"] | None = None


class CommandCreate(BaseModel):
    type: str = Field("slash", pattern=r"^(slash|user|message)$")
    name: str = Field(..., min_length=1, max_length=32, pattern=r"^[a-z0-9_-]+$")
    description: str = Field("", max_length=128)
    options: list[CommandOption] = Field(default_factory=list)
    guild_id: uuid.UUID | None = None


class CommandResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    application_id: uuid.UUID
    type: str
    name: str
    description: str
    options: list[dict]
    guild_id: uuid.UUID | None


# ── OAuth2 ────────────────────────────────────────────────────────────────

class OAuth2TokenRequest(BaseModel):
    grant_type: str
    code: str | None = None
    redirect_uri: str | None = None
    client_id: str
    client_secret: str
    refresh_token: str | None = None
    scope: str | None = None


class OAuth2TokenResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int
    refresh_token: str
    scope: str
