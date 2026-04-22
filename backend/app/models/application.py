"""Developer applications, bots, OAuth2 codes/tokens, slash commands."""
import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Integer, BigInteger, ForeignKey, Text, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY

from app.database import Base


class Application(Base):
    __tablename__ = "applications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # Public identifiers used by OAuth2 clients.
    client_id: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    # client_secret is shown once on creation, then only the hash lives on.
    client_secret_hash: Mapped[str] = mapped_column(String(128), nullable=False)

    redirect_uris: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    # Capability badges for the app/bot (displayed in /developers + install UIs).
    supports_commands: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    supports_voice: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Intents bitfield the bot declares. Privileged intents require verification.
    intents: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)

    # Whether anyone can invite this bot (public) or only the owner (private).
    public_bot: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    bot = relationship("Bot", back_populates="application", uselist=False, cascade="all, delete-orphan")
    commands = relationship("BotCommand", back_populates="application", cascade="all, delete-orphan")


class Bot(Base):
    """The actual bot user attached to an application. A bot is a User with
    is_bot=True. We keep only the hash of the bot token — the raw token is
    shown once at creation / regeneration."""
    __tablename__ = "bots"

    application_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("applications.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    # Last four chars of the token for UI display (so user knows which one was revoked).
    token_suffix: Mapped[str] = mapped_column(String(8), nullable=False, default="")
    # Recommended / auto shard count the client library uses.
    shard_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    application = relationship("Application", back_populates="bot")


class BotCommand(Base):
    __tablename__ = "bot_commands"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    application_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("applications.id", ondelete="CASCADE"), nullable=False, index=True)

    # "slash" — chat commands invoked as /name
    # "user" — appears in right-click on a user
    # "message" — appears in right-click on a message
    type: Mapped[str] = mapped_column(String(16), default="slash", nullable=False)
    name: Mapped[str] = mapped_column(String(32), nullable=False)
    description: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    # Option schema — list of {name, description, type, required, choices?, options?}
    options: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    # Optional scoping: if guild_id set, command is only registered on that server.
    guild_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("servers.id", ondelete="CASCADE"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    application = relationship("Application", back_populates="commands")


class OAuth2AuthorizationCode(Base):
    """Short-lived code returned after user consent, exchanged for tokens."""
    __tablename__ = "oauth2_codes"

    code: Mapped[str] = mapped_column(String(48), primary_key=True)
    application_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("applications.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    redirect_uri: Mapped[str] = mapped_column(String(512), nullable=False)
    scope: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class OAuth2Token(Base):
    """Persistent access/refresh pair granted to a third-party app after OAuth2 flow."""
    __tablename__ = "oauth2_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    application_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("applications.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    access_token_hash: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    refresh_token_hash: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    scope: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
