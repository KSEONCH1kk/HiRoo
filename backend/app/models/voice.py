import uuid
from datetime import datetime
from sqlalchemy import ForeignKey, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class VoiceState(Base):
    __tablename__ = "voice_states"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    channel_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("channels.id", ondelete="SET NULL"), nullable=True
    )
    server_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("servers.id", ondelete="SET NULL"), nullable=True
    )
    is_muted: Mapped[bool] = mapped_column(Boolean, default=False)
    is_deafened: Mapped[bool] = mapped_column(Boolean, default=False)
    is_sharing_screen: Mapped[bool] = mapped_column(Boolean, default=False)
    is_video: Mapped[bool] = mapped_column(Boolean, default=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="voice_state")
    channel = relationship("Channel")
    server = relationship("Server")
