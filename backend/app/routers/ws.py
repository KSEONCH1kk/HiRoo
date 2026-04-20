import json
import uuid
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.security import verify_access_token
from app.core.deps import get_db, get_redis
from app.models.user import User
from app.models.server import ServerMember
from app.models.channel import Channel
from app.services.websocket_service import manager
import redis.asyncio as aioredis

router = APIRouter(tags=["websocket"])


@router.websocket("/ws")
async def websocket_endpoint(
    ws: WebSocket,
    token: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    await ws.accept()
    user: User | None = None

    try:
        # Auth via query param or first message
        if token:
            payload = verify_access_token(token)
            if payload and not await redis.get(f"blacklist:{token}"):
                result = await db.execute(select(User).where(User.id == uuid.UUID(payload["sub"])))
                user = result.scalar_one_or_none()

        if not user:
            # Wait for identify message
            try:
                raw = await ws.receive_text()
                data = json.loads(raw)
                if data.get("event") == "identify":
                    t = data.get("data", {}).get("token", "")
                    payload = verify_access_token(t)
                    if payload and not await redis.get(f"blacklist:{t}"):
                        result = await db.execute(select(User).where(User.id == uuid.UUID(payload["sub"])))
                        user = result.scalar_one_or_none()
            except Exception:
                pass

        if not user:
            await ws.send_text(json.dumps({"event": "error", "data": {"message": "Unauthorized"}}))
            await ws.close(code=4001)
            return

        # Register connection
        manager.connect(str(user.id), ws)

        # Join all servers user belongs to
        result = await db.execute(
            select(ServerMember.server_id).where(ServerMember.user_id == user.id)
        )
        for (sid,) in result.all():
            manager.join_server(str(sid), str(user.id))

        await ws.send_text(json.dumps({"event": "ready", "data": {"user_id": str(user.id)}}))

        # Update status to online and commit immediately so other sessions see it
        user.status = "online"
        await db.commit()
        # Notify user's servers
        result = await db.execute(
            select(ServerMember.server_id).where(ServerMember.user_id == user.id)
        )
        for (sid,) in result.all():
            await manager.broadcast_to_server(str(sid), {
                "event": "presence_update",
                "data": {"user_id": str(user.id), "status": "online"},
            }, exclude_user=str(user.id))

        # Send voice snapshot: who's currently in which voice room on user's servers
        # Also include DM voice rooms where the user participates (to catch active calls)
        snapshot: dict[str, list[str]] = {}
        for room_id, members in manager._voice_rooms.items():
            if room_id.startswith("channel:"):
                try:
                    ch_uuid = uuid.UUID(room_id.split(":", 1)[1])
                except Exception:
                    continue
                ch_res = await db.execute(select(Channel).where(Channel.id == ch_uuid))
                ch = ch_res.scalar_one_or_none()
                if not ch:
                    continue
                mem_res = await db.execute(
                    select(ServerMember).where(
                        ServerMember.server_id == ch.server_id,
                        ServerMember.user_id == user.id,
                    )
                )
                if mem_res.scalar_one_or_none():
                    snapshot[room_id] = list(members)
        if snapshot:
            await ws.send_text(json.dumps({
                "event": "voice_snapshot",
                "data": {"rooms": snapshot},
            }))

        # Main receive loop
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            event = data.get("event")
            payload = data.get("data", {})

            if event == "typing_start":
                channel_id = payload.get("channel_id")
                dm_id = payload.get("dm_id")
                await manager.broadcast_to_server(
                    payload.get("server_id", ""),
                    {"event": "typing", "data": {"user_id": str(user.id), "channel_id": channel_id, "is_typing": True}},
                    exclude_user=str(user.id),
                )

            elif event == "typing_stop":
                channel_id = payload.get("channel_id")
                await manager.broadcast_to_server(
                    payload.get("server_id", ""),
                    {"event": "typing", "data": {"user_id": str(user.id), "channel_id": channel_id, "is_typing": False}},
                    exclude_user=str(user.id),
                )

            elif event == "voice_signal":
                target_id = payload.get("target_user_id")
                if target_id:
                    await manager.send_to_user(target_id, {
                        "event": "voice_signal",
                        "data": {
                            "from_user_id": str(user.id),
                            "signal_data": payload.get("signal_data"),
                        },
                    })

            elif event == "voice_join":
                room_id = payload.get("room_id")
                if not room_id:
                    continue
                existing = manager.voice_join(str(user.id), room_id)
                await ws.send_text(json.dumps({
                    "event": "voice_room_joined",
                    "data": {"room_id": room_id, "peers": existing},
                }))
                # Broadcast to: existing peers + server members (so sidebar updates for everyone)
                notify_data = {
                    "event": "voice_peer_joined",
                    "data": {
                        "room_id": room_id,
                        "user_id": str(user.id),
                        "username": user.username,
                    },
                }
                if room_id.startswith("channel:"):
                    channel_uuid_str = room_id.split(":", 1)[1]
                    try:
                        ch_res = await db.execute(
                            select(Channel).where(Channel.id == uuid.UUID(channel_uuid_str))
                        )
                        channel = ch_res.scalar_one_or_none()
                        if channel:
                            await manager.broadcast_to_server(
                                str(channel.server_id), notify_data,
                                exclude_user=str(user.id),
                            )
                            continue
                    except Exception:
                        pass
                # Fallback: just voice-room peers (for DM rooms)
                for peer_id in existing:
                    await manager.send_to_user(peer_id, notify_data)

            elif event == "voice_leave":
                room_id, remaining = manager.voice_leave(str(user.id))
                if not room_id:
                    continue
                notify_data = {
                    "event": "voice_peer_left",
                    "data": {"room_id": room_id, "user_id": str(user.id)},
                }
                if room_id.startswith("channel:"):
                    channel_uuid_str = room_id.split(":", 1)[1]
                    try:
                        ch_res = await db.execute(
                            select(Channel).where(Channel.id == uuid.UUID(channel_uuid_str))
                        )
                        channel = ch_res.scalar_one_or_none()
                        if channel:
                            await manager.broadcast_to_server(
                                str(channel.server_id), notify_data,
                                exclude_user=str(user.id),
                            )
                            continue
                    except Exception:
                        pass
                for peer_id in remaining:
                    await manager.send_to_user(peer_id, notify_data)

            elif event == "voice_ring":
                target_id = payload.get("target_user_id")
                room_id = payload.get("room_id")
                if target_id and room_id:
                    await manager.send_to_user(target_id, {
                        "event": "voice_ring",
                        "data": {
                            "from_user_id": str(user.id),
                            "from_username": user.username,
                            "from_display_name": user.display_name,
                            "from_avatar_url": user.avatar_url,
                            "room_id": room_id,
                            "video": payload.get("video", False),
                        },
                    })

            elif event == "voice_ring_cancel":
                target_id = payload.get("target_user_id")
                room_id = payload.get("room_id")
                if target_id:
                    await manager.send_to_user(target_id, {
                        "event": "voice_ring_cancel",
                        "data": {"from_user_id": str(user.id), "room_id": room_id},
                    })

            elif event == "voice_ring_decline":
                target_id = payload.get("target_user_id")
                if target_id:
                    await manager.send_to_user(target_id, {
                        "event": "voice_ring_decline",
                        "data": {"from_user_id": str(user.id)},
                    })

    except WebSocketDisconnect:
        pass
    finally:
        if user:
            # Leave voice room if any
            room_id, remaining = manager.voice_leave(str(user.id))
            if room_id:
                notify_data = {
                    "event": "voice_peer_left",
                    "data": {"room_id": room_id, "user_id": str(user.id)},
                }
                if room_id.startswith("channel:"):
                    channel_uuid_str = room_id.split(":", 1)[1]
                    try:
                        ch_res = await db.execute(
                            select(Channel).where(Channel.id == uuid.UUID(channel_uuid_str))
                        )
                        channel = ch_res.scalar_one_or_none()
                        if channel:
                            await manager.broadcast_to_server(str(channel.server_id), notify_data)
                        else:
                            for peer_id in remaining:
                                await manager.send_to_user(peer_id, notify_data)
                    except Exception:
                        for peer_id in remaining:
                            await manager.send_to_user(peer_id, notify_data)
                else:
                    for peer_id in remaining:
                        await manager.send_to_user(peer_id, notify_data)
            manager.disconnect(str(user.id), ws)
            if not manager.is_online(str(user.id)):
                try:
                    fresh = await db.get(User, user.id)
                    if fresh:
                        fresh.status = "offline"
                        await db.commit()
                    result = await db.execute(
                        select(ServerMember.server_id).where(ServerMember.user_id == user.id)
                    )
                    for (sid,) in result.all():
                        await manager.broadcast_to_server(str(sid), {
                            "event": "presence_update",
                            "data": {"user_id": str(user.id), "status": "offline"},
                        })
                except Exception:
                    try: await db.rollback()
                    except Exception: pass
