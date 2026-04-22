import uuid
from datetime import datetime
from sqlalchemy import String, ForeignKey, Integer, Boolean, BigInteger, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


# Permission bits
class Permissions:
    MANAGE_SERVER = 1 << 0
    MANAGE_CHANNELS = 1 << 1
    MANAGE_ROLES = 1 << 2
    MANAGE_MESSAGES = 1 << 3
    KICK_MEMBERS = 1 << 4
    BAN_MEMBERS = 1 << 5
    CREATE_INVITE = 1 << 6
    SEND_MESSAGES = 1 << 7
    READ_MESSAGES = 1 << 8
    ATTACH_FILES = 1 << 9
    ADD_REACTIONS = 1 << 10
    MENTION_EVERYONE = 1 << 11
    CONNECT_VOICE = 1 << 12
    SPEAK_VOICE = 1 << 13
    VIDEO = 1 << 14
    SCREENSHARE = 1 << 15
    MOVE_MEMBERS = 1 << 16
    MUTE_MEMBERS = 1 << 17
    DEAFEN_MEMBERS = 1 << 18
    # Soundboard
    USE_SOUNDBOARD = 1 << 19      # trigger sounds in a voice room
    UPLOAD_SOUNDBOARD = 1 << 20   # add new sounds to the server
    MANAGE_SOUNDBOARD = 1 << 21   # delete / edit any sound

    DEFAULT = (
        SEND_MESSAGES | READ_MESSAGES | ATTACH_FILES | ADD_REACTIONS
        | CONNECT_VOICE | SPEAK_VOICE | VIDEO | CREATE_INVITE
        | USE_SOUNDBOARD
    )
    ADMIN = (1 << 32) - 1


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    server_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("servers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    color: Mapped[str] = mapped_column(String(9), default="#99aab5")
    position: Mapped[int] = mapped_column(Integer, default=0)
    permissions: Mapped[int] = mapped_column(BigInteger, default=Permissions.DEFAULT)
    hoist: Mapped[bool] = mapped_column(Boolean, default=False)
    mentionable: Mapped[bool] = mapped_column(Boolean, default=False)
    is_everyone: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MemberRole(Base):
    __tablename__ = "member_roles"

    server_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True
    )
