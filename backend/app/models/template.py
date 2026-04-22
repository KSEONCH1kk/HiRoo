import uuid
from datetime import datetime
from sqlalchemy import String, ForeignKey, Integer, DateTime, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ServerTemplate(Base):
    """A serialised snapshot of a server's channels, roles, and core
    settings. Anyone with the `code` can preview the template and either
    spin up a new server or merge it into an existing one they own."""

    __tablename__ = "server_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # URL-safe short code, shareable like invite codes.
    code: Mapped[str] = mapped_column(String(16), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    creator_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    source_server_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("servers.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    # JSONB: {channels: [...], roles: [...], settings: {...}}.
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    usage_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
