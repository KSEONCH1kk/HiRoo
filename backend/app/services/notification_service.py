import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.notification import Notification
from app.services.websocket_service import manager


async def create_notification(
    db: AsyncSession,
    user_id: uuid.UUID,
    kind: str,
    from_user_id: uuid.UUID | None = None,
    server_id: uuid.UUID | None = None,
    channel_id: uuid.UUID | None = None,
    content: str | None = None,
) -> Notification:
    notif = Notification(
        user_id=user_id,
        kind=kind,
        from_user_id=from_user_id,
        server_id=server_id,
        channel_id=channel_id,
        content=content,
    )
    db.add(notif)
    await db.flush()

    # Push real-time notification
    await manager.send_to_user(
        str(user_id),
        {
            "event": "notification",
            "data": {
                "id": str(notif.id),
                "kind": kind,
                "content": content,
                "from_user_id": str(from_user_id) if from_user_id else None,
                "server_id": str(server_id) if server_id else None,
                "channel_id": str(channel_id) if channel_id else None,
                "created_at": notif.created_at.isoformat() if notif.created_at else None,
            },
        },
    )
    return notif
