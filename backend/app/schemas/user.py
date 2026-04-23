import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
import re


def _compute_tag_from_orm(values):
    """Best-effort extraction of a ClanTag from an ORM User with its
    `active_tag_server` relationship pre-loaded via selectinload. If the
    relationship isn't loaded or the server lacks tag_label/icon, returns
    the original object unchanged so Pydantic falls back to `None`."""
    srv = None
    try:
        srv = getattr(values, "active_tag_server", None)
    except Exception:
        return values
    if not srv:
        return values
    if not getattr(srv, "tag_label", None) or not getattr(srv, "tag_icon", None):
        return values
    try:
        cols = {c.name: getattr(values, c.name) for c in values.__table__.columns}
    except AttributeError:
        return values
    cols["tag"] = {
        "label": srv.tag_label,
        "icon": srv.tag_icon,
        "server_id": srv.id,
        "server_name": srv.name,
    }
    return cols


class UserBase(BaseModel):
    username: str = Field(..., min_length=2, max_length=32, pattern=r"^[a-zA-Z0-9_.\-]+$")
    display_name: str | None = Field(None, max_length=64)


class UserCreate(UserBase):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    captcha_token: str | None = Field(None, max_length=4096)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not re.search(r"[A-Za-z]", v):
            raise ValueError("Password must contain at least one letter")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one digit")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)
    captcha_token: str | None = Field(None, max_length=4096)


class UserUpdate(BaseModel):
    display_name: str | None = Field(None, max_length=64)
    custom_status: str | None = Field(None, max_length=128)
    # Empty-string or null both clear the tag; UUID sets it. Validation of
    # membership + server having a tag is done in the router.
    active_tag_server_id: uuid.UUID | None = None


class ClanTag(BaseModel):
    label: str
    icon: str
    server_id: uuid.UUID
    server_name: str | None = None


class UserStatusUpdate(BaseModel):
    status: str = Field(..., pattern=r"^(online|idle|dnd|offline)$")


class UserResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    email: str
    username: str
    display_name: str | None
    avatar_url: str | None
    status: str
    custom_status: str | None
    is_verified: bool
    is_platform_admin: bool = False
    created_at: datetime
    public_key: str | None = None
    signing_public_key: str | None = None
    badges: list[str] = []
    # Preferences (exposed only on /me)
    dm_permission: str = "everyone"
    friend_request_permission: str = "everyone"
    show_online_status: bool = True
    notif_sound: bool = True
    notif_desktop: bool = True
    notif_level: str = "mentions"
    # Appearance / input
    theme: str = "dark"
    accent_color: str = "#7c5cff"
    hotkeys: dict[str, str] | None = None
    # Telemetry
    science_enabled: bool = True
    tag: ClanTag | None = None


class PreferencesUpdate(BaseModel):
    dm_permission: str | None = Field(None, pattern=r"^(everyone|friends)$")
    friend_request_permission: str | None = Field(None, pattern=r"^(everyone|friends)$")
    show_online_status: bool | None = None
    notif_sound: bool | None = None
    notif_desktop: bool | None = None
    notif_level: str | None = Field(None, pattern=r"^(all|mentions|none)$")
    theme: str | None = Field(None, pattern=r"^(dark|light)$")
    # Хекс "#RRGGBB" или "#RRGGBBAA".
    accent_color: str | None = Field(None, pattern=r"^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")
    # Словарь action_id → accelerator-строка ("CommandOrControl+Shift+M").
    # Пустая строка / null / отсутствие ключа = action не назначен.
    hotkeys: dict[str, str] | None = None
    # Telemetry opt-out.
    science_enabled: bool | None = None

    @field_validator("hotkeys")
    @classmethod
    def _validate_hotkeys(cls, v):
        if v is None:
            return v
        ALLOWED = {
            "toggle_mute", "toggle_deafen", "push_to_talk",
            "toggle_video", "toggle_screen_share", "disconnect",
            "toggle_window",
        }
        out: dict[str, str] = {}
        for k, acc in v.items():
            if k not in ALLOWED:
                # Молча отбрасываем неизвестные действия, чтобы новый
                # клиент не падал на старом backend и наоборот.
                continue
            if not isinstance(acc, str):
                continue
            acc = acc.strip()
            if not acc or len(acc) > 64:
                continue
            out[k] = acc
        return out


class UserPublic(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    username: str
    display_name: str | None
    avatar_url: str | None
    status: str
    custom_status: str | None
    is_verified: bool = False
    is_platform_admin: bool = False
    created_at: datetime | None = None
    public_key: str | None = None
    signing_public_key: str | None = None
    badges: list[str] = []
    tag: ClanTag | None = None

    @model_validator(mode="before")
    @classmethod
    def _populate_tag(cls, values):
        return _compute_tag_from_orm(values)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
