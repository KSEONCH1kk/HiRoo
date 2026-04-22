"""Interactions — records of a user clicking a button / picking a select option.

Flow:
  1. User clicks a message component. Frontend POSTs to /api/interactions.
  2. Backend creates an Interaction row, assigns it a short-lived token, and
     dispatches to the owning bot's gateway connection.
  3. Bot replies via POST /api/interactions/{id}/callback within 3s.
  4. Optional follow-up messages via POST /api/interactions/{id}/followup.
"""
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, func, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.database import Base


class Interaction(Base):
    __tablename__ = "interactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    application_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("applications.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    channel_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    dm_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    message_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    guild_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    # "component" — button/select; "command" — slash command (from picker).
    type: Mapped[str] = mapped_column(String(16), nullable=False)
    custom_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    command_name: Mapped[str | None] = mapped_column(String(32), nullable=True)
    data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    token: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    responded: Mapped[bool] = mapped_column(default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
