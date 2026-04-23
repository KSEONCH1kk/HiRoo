import uuid
from datetime import datetime
from typing import Any
from sqlalchemy import String, ForeignKey, Boolean, DateTime, func, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.database import Base


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    channel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("channels.id", ondelete="CASCADE"), nullable=False, index=True
    )
    author_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # 'text' (default, normal message) | 'system_welcome' (auto on join).
    type: Mapped[str] = mapped_column(String(16), default="text", nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    reply_to_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("messages.id", ondelete="SET NULL"), nullable=True
    )
    webhook_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("webhooks.id", ondelete="SET NULL"), nullable=True
    )
    webhook_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    webhook_avatar_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    embeds: Mapped[Any | None] = mapped_column(JSONB, nullable=True)
    components: Mapped[Any | None] = mapped_column(JSONB, nullable=True)
    application_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    channel = relationship("Channel", back_populates="messages")
    author = relationship("User", foreign_keys=[author_id])
    reply_to = relationship("Message", remote_side="Message.id", foreign_keys=[reply_to_id])
    reactions = relationship("MessageReaction", back_populates="message", cascade="all, delete-orphan")


class MessageReaction(Base):
    __tablename__ = "message_reactions"

    message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("messages.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    emoji: Mapped[str] = mapped_column(String(32), primary_key=True)

    message = relationship("Message", back_populates="reactions")
    user = relationship("User")
