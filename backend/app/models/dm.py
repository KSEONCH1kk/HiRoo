import uuid
from datetime import datetime
from sqlalchemy import String, ForeignKey, Boolean, DateTime, func, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class DirectMessage(Base):
    __tablename__ = "direct_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    is_group: Mapped[bool] = mapped_column(Boolean, default=False)
    name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    icon_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    participants = relationship("DMParticipant", back_populates="dm", cascade="all, delete-orphan")
    messages = relationship("DMMessage", back_populates="dm", cascade="all, delete-orphan")


class DMParticipant(Base):
    __tablename__ = "dm_participants"

    dm_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("direct_messages.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    dm = relationship("DirectMessage", back_populates="participants")
    user = relationship("User")


class DMMessage(Base):
    __tablename__ = "dm_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dm_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("direct_messages.id", ondelete="CASCADE"), nullable=False, index=True
    )
    author_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    type: Mapped[str] = mapped_column(String(16), nullable=False, default="text")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    reply_to_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("dm_messages.id", ondelete="SET NULL"), nullable=True
    )
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pinned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    dm = relationship("DirectMessage", back_populates="messages")
    author = relationship("User", foreign_keys=[author_id])
    reply_to = relationship("DMMessage", remote_side="DMMessage.id", foreign_keys=[reply_to_id])
    reactions = relationship("DMMessageReaction", back_populates="message", cascade="all, delete-orphan")


class DMMessageReaction(Base):
    __tablename__ = "dm_message_reactions"

    message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("dm_messages.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    emoji: Mapped[str] = mapped_column(String(32), primary_key=True)

    message = relationship("DMMessage", back_populates="reactions")
