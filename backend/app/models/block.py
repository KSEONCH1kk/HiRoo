"""Per-user block list. blocker can't see messages from blocked, blocked
can't DM / friend-request / add-to-group-DM the blocker."""
import uuid
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, PrimaryKeyConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class UserBlock(Base):
    __tablename__ = "user_blocks"
    __table_args__ = (PrimaryKeyConstraint("blocker_id", "blocked_id", name="pk_user_blocks"),)

    blocker_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    blocked_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
