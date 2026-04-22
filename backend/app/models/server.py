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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", foreign_keys=[owner_id])
    members = relationship("ServerMember", back_populates="server", cascade="all, delete-orphan")
    channels = relationship("Channel", back_populates="server", cascade="all, delete-orphan")


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
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    server = relationship("Server", back_populates="members")
    user = relationship("User", back_populates="memberships")
