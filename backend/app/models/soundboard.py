import uuid
from datetime import datetime
from sqlalchemy import String, ForeignKey, Integer, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class SoundboardSound(Base):
    """One short audio clip (≤ 30s) uploaded to a server, playable by members
    with `USE_SOUNDBOARD` permission in any voice room on that server."""

    __tablename__ = "soundboard_sounds"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    server_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("servers.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    name: Mapped[str] = mapped_column(String(32), nullable=False)
    emoji: Mapped[str | None] = mapped_column(String(8), nullable=True)
    uploader_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Relative path inside UPLOAD_DIR: "soundboard/<server_id>/<filename>"
    file_path: Mapped[str] = mapped_column(String(255), nullable=False)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
