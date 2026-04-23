import uuid
from datetime import datetime
from sqlalchemy import String, ForeignKey, Boolean, DateTime, func, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Server(Base):
    __tablename__ = "servers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    icon_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    invite_code: Mapped[str] = mapped_column(String(8), unique=True, nullable=False, index=True)
    invite_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_discoverable: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    # Short clan/server tag — max 8 chars label + icon key from a fixed pool
    # (see app/services/tag_icons.py). Displayed next to usernames for
    # members who picked this server as their active tag source.
    tag_label: Mapped[str | None] = mapped_column(String(8), nullable=True)
    tag_icon: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # System messages (welcome on join, etc). Null system_channel_id hides
    # them entirely. welcome_enabled lets admins keep the channel but
    # temporarily mute welcomes without losing the selection.
    system_channel_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("channels.id", ondelete="SET NULL"),
        nullable=True,
    )
    welcome_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # AutoMod — simple config. Word filter trips on any case-insensitive
    # substring match of `auto_mod_words`. Mention-spam trips when a single
    # message has ≥ auto_mod_mention_threshold raw @mentions (0 = disabled).
    # action ∈ {"delete" | "timeout"}. On "timeout" we mute the author for
    # auto_mod_timeout_seconds.
    from sqlalchemy.dialects.postgresql import JSONB as _AM_JSONB  # local alias
    auto_mod_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    auto_mod_words: Mapped[list] = mapped_column(_AM_JSONB, default=list, nullable=False)
    auto_mod_mention_threshold: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    auto_mod_action: Mapped[str] = mapped_column(String(16), default="delete", nullable=False)
    auto_mod_timeout_seconds: Mapped[int] = mapped_column(Integer, default=300, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", foreign_keys=[owner_id])
    members = relationship("ServerMember", back_populates="server", cascade="all, delete-orphan")
    # Explicit foreign_keys because the server also has system_channel_id
    # pointing BACK to channels, which creates two FK paths between the
    # two tables and confuses SQLAlchemy's auto-join resolution.
    channels = relationship(
        "Channel", back_populates="server",
        cascade="all, delete-orphan",
        foreign_keys="Channel.server_id",
    )


class ServerMember(Base):
    __tablename__ = "server_members"

    server_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("servers.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[str] = mapped_column(String(16), default="member")  # owner/admin/member
    nickname: Mapped[str | None] = mapped_column(String(64), nullable=True)
    muted: Mapped[bool] = mapped_column(Boolean, default=False)
    deafened: Mapped[bool] = mapped_column(Boolean, default=False)
    # NULL = not timed out. Non-null = this member is muted across all
    # server channels/voice/forums until the timestamp. On any send we
    # treat `now >= timeout_until` as "timeout expired, clear it".
    timeout_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    timeout_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Per-user sort order in the left server rail. Lower = higher up.
    # New memberships default to 0; `POST /api/servers/reorder` pushes the
    # saved ordering.
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    server = relationship("Server", back_populates="members")
    user = relationship("User", back_populates="memberships")
