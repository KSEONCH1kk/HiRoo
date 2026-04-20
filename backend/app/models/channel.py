import uuid
from datetime import datetime
from sqlalchemy import String, ForeignKey, Boolean, DateTime, func, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Channel(Base):
    __tablename__ = "channels"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    server_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("servers.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    type: Mapped[str] = mapped_column(String(16), default="text")  # text/voice/announcement
    position: Mapped[int] = mapped_column(Integer, default=0)
    topic: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    is_private: Mapped[bool] = mapped_column(Boolean, default=False)
    slowmode_seconds: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    server = relationship("Server", back_populates="channels")
    messages = relationship("Message", back_populates="channel", cascade="all, delete-orphan")
