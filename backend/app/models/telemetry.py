"""Client telemetry (a-la Discord Science).

Клиент шлёт батчи событий в POST /api/science, сервер складывает в
`telemetry_events`. Таблица писательская: никаких FK-каскадов и
relationships, чтобы вставки были дешёвыми и не держали ссылок на
users (события не удаляются при удалении юзера, user_id становится NULL).
"""
import uuid
from datetime import datetime
from sqlalchemy import BigInteger, String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, JSONB, INET
from app.database import Base


class TelemetryEvent(Base):
    __tablename__ = "telemetry_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    session_id: Mapped[str] = mapped_column(String(64), nullable=False)
    event_name: Mapped[str] = mapped_column(String(64), nullable=False)
    properties: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    context: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    client_track_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    client_send_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    server_received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    ip: Mapped[str | None] = mapped_column(INET, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
