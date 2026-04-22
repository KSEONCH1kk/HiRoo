import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False, index=True)
    username: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(128), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="offline")  # online/idle/dnd/offline
    custom_status: Mapped[str | None] = mapped_column(String(128), nullable=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_banned: Mapped[bool] = mapped_column(Boolean, default=False)
    is_platform_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_bot: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    public_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    signing_public_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    memberships = relationship("ServerMember", back_populates="user", lazy="dynamic")
    sent_friend_requests = relationship(
        "FriendRequest", foreign_keys="FriendRequest.from_user_id", back_populates="from_user", lazy="dynamic"
    )
    received_friend_requests = relationship(
        "FriendRequest", foreign_keys="FriendRequest.to_user_id", back_populates="to_user", lazy="dynamic"
    )
    notifications = relationship("Notification", foreign_keys="Notification.user_id", back_populates="user", lazy="dynamic")
    voice_state = relationship("VoiceState", back_populates="user", uselist=False)
