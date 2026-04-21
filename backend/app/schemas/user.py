import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, field_validator
import re


class UserBase(BaseModel):
    username: str = Field(..., min_length=2, max_length=32, pattern=r"^[a-zA-Z0-9_.\-]+$")
    display_name: str | None = Field(None, max_length=64)


class UserCreate(UserBase):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)

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


class UserUpdate(BaseModel):
    display_name: str | None = Field(None, max_length=64)
    custom_status: str | None = Field(None, max_length=128)


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
    created_at: datetime
    public_key: str | None = None


class UserPublic(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    username: str
    display_name: str | None
    avatar_url: str | None
    status: str
    custom_status: str | None
    public_key: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
