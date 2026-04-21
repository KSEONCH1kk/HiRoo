import uuid
from sqlalchemy import ForeignKey, BigInteger
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class ChannelRolePermission(Base):
    __tablename__ = "channel_role_permissions"

    channel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("channels.id", ondelete="CASCADE"), primary_key=True
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True
    )
    allow: Mapped[int] = mapped_column(BigInteger, default=0)
    deny: Mapped[int] = mapped_column(BigInteger, default=0)
