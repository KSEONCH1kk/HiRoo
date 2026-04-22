import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, ForeignKey, func
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

    # ── Privacy ──────────────────────────────────────────────────────
    # "everyone" (default) | "friends"
    dm_permission: Mapped[str] = mapped_column(String(16), default="everyone", nullable=False)
    # "everyone" | "friends"
    friend_request_permission: Mapped[str] = mapped_column(String(16), default="everyone", nullable=False)
    show_online_status: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # ── Notifications ────────────────────────────────────────────────
    notif_sound: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notif_desktop: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # "all" (every message) | "mentions" (only @user) | "none"
    notif_level: Mapped[str] = mapped_column(String(16), default="mentions", nullable=False)

    # Which server's clan tag to display next to this user's name (nullable
    # = no tag). Server is expected to have tag_label/tag_icon set and the
    # user must still be a member — enforced at write time, and silently
    # skipped at read time if violated.
    active_tag_server_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("servers.id", ondelete="SET NULL"),
        nullable=True,
    )

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
    # lazy="selectin" so every User fetch auto-loads the tag-source server
    # in the same round trip — saves updating 27 selectinload() call sites.
    active_tag_server = relationship(
        "Server", foreign_keys=[active_tag_server_id], lazy="selectin",
    )
