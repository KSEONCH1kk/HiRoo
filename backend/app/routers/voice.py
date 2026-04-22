import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.core.config import settings
from app.core.deps import get_db, get_current_active_user, compute_permissions
from app.models.user import User
from app.models.server import ServerMember
from app.models.channel import Channel
from app.models.dm import DMParticipant
from app.models.voice import VoiceState
from app.models.role import Permissions
from app.schemas.notification import VoiceJoin, VoiceStateUpdate, VoiceStateResponse
from app.services.websocket_service import manager

router = APIRouter(prefix="/api/voice", tags=["voice"])


class VoiceTokenResponse(BaseModel):
    url: str
    token: str


@router.get("/token", response_model=VoiceTokenResponse)
async def voice_token(
    room: str = Query(..., description="Room identifier: 'dm:{dm_id}' or 'channel:{channel_id}'"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if not settings.LIVEKIT_URL or not settings.LIVEKIT_API_KEY or not settings.LIVEKIT_API_SECRET:
        raise HTTPException(status_code=503, detail="LiveKit не сконфигурирован на сервере")

    # Bots that request a voice token implicitly declare voice support. Flip
    # the capability flag once so the /developers UI and badges reflect it.
    if getattr(current_user, "is_bot", False):
        from app.models.application import Application as _App, Bot as _Bot
        ar = await db.execute(
            select(_App).join(_Bot, _Bot.application_id == _App.id)
            .where(_Bot.user_id == current_user.id)
        )
        _app = ar.scalar_one_or_none()
        if _app and not _app.supports_voice:
            _app.supports_voice = True
            await db.flush()

    # Authorize: user must belong to the referenced room
    if room.startswith("channel:"):
        try:
            channel_id = uuid.UUID(room.split(":", 1)[1])
        except ValueError:
            raise HTTPException(status_code=400, detail="Неверный room id")
        ch_res = await db.execute(select(Channel).where(Channel.id == channel_id))
        channel = ch_res.scalar_one_or_none()
        if not channel or channel.type != "voice":
            raise HTTPException(status_code=404, detail="Голосовой канал не найден")
        mem_res = await db.execute(
            select(ServerMember).where(
                ServerMember.server_id == channel.server_id,
                ServerMember.user_id == current_user.id,
            )
        )
        if not mem_res.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Вы не участник сервера")
        perms = await compute_permissions(channel.server_id, current_user.id, db, channel_id=channel.id)
        if not (perms & Permissions.CONNECT_VOICE):
            raise HTTPException(status_code=403, detail="Нет права подключаться к этому голосовому каналу")
    elif room.startswith("dm:"):
        try:
            dm_id = uuid.UUID(room.split(":", 1)[1])
        except ValueError:
            raise HTTPException(status_code=400, detail="Неверный room id")
        p_res = await db.execute(
            select(DMParticipant).where(
                DMParticipant.dm_id == dm_id,
                DMParticipant.user_id == current_user.id,
            )
        )
        if not p_res.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Вы не участник этого диалога")
    else:
        raise HTTPException(status_code=400, detail="Поддерживаются только префиксы 'dm:' и 'channel:'")

    # Compute publish rights based on permissions (channel rooms only; DM rooms — full publish)
    can_publish = True
    can_publish_sources: list[str] = []
    if room.startswith("channel:"):
        if getattr(current_user, "is_bot", False):
            # Bots always get full publish rights — their app declares what it
            # needs via its capability flags (supports_voice), not per-role.
            can_publish = True
            can_publish_sources = ["microphone", "camera", "screen_share", "screen_share_audio"]
        else:
            # We already computed perms above for channel rooms
            has_speak = bool(perms & Permissions.SPEAK_VOICE)
            has_video = bool(perms & Permissions.VIDEO)
            has_screen = bool(perms & Permissions.SCREENSHARE)
            can_publish = has_speak
            if has_speak:
                can_publish_sources.append("microphone")
                if has_video: can_publish_sources.append("camera")
                if has_screen:
                    can_publish_sources.append("screen_share")
                    can_publish_sources.append("screen_share_audio")

    # Build JWT directly — LiveKit accepts standard HS256 JWT with `video` claim
    import time
    from jose import jwt
    now = int(time.time())
    video_grant: dict = {
        "roomJoin": True,
        "room": room,
        "canSubscribe": True,
        "canPublishData": True,
        "canPublish": can_publish,
    }
    if can_publish and can_publish_sources:
        video_grant["canPublishSources"] = can_publish_sources
    payload = {
        "iss": settings.LIVEKIT_API_KEY,
        "sub": str(current_user.id),
        "name": current_user.display_name or current_user.username,
        "nbf": now,
        "exp": now + 3600 * 6,  # 6h
        "video": video_grant,
    }
    token = jwt.encode(payload, settings.LIVEKIT_API_SECRET, algorithm="HS256")
    return VoiceTokenResponse(url=settings.LIVEKIT_URL, token=token)


class VoicePresenceBody(BaseModel):
    room: str


@router.post("/presence")
async def voice_presence_join(
    body: VoicePresenceBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Register the caller as present in `room` for the in-memory voice room
    tracker, so every client subscribed to the server sees `voice_peer_joined`.

    Used by the Python client library (and bots) after they connect to
    LiveKit — the regular web client uses the WS `voice_join` event instead,
    but bots don't have a WS /ws connection."""
    room_id = body.room
    if not room_id or not (room_id.startswith("channel:") or room_id.startswith("dm:")):
        raise HTTPException(status_code=400, detail="Invalid room id")

    # Authorize — reuse the same checks as /token.
    if room_id.startswith("channel:"):
        try:
            channel_uuid = uuid.UUID(room_id.split(":", 1)[1])
        except ValueError:
            raise HTTPException(status_code=400, detail="Bad channel id")
        ch_res = await db.execute(select(Channel).where(Channel.id == channel_uuid))
        channel = ch_res.scalar_one_or_none()
        if not channel or channel.type != "voice":
            raise HTTPException(status_code=404, detail="Voice channel not found")
        mem_res = await db.execute(
            select(ServerMember).where(
                ServerMember.server_id == channel.server_id,
                ServerMember.user_id == current_user.id,
            )
        )
        if not mem_res.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Not a server member")
        perms = await compute_permissions(channel.server_id, current_user.id, db, channel_id=channel.id)
        if not (perms & Permissions.CONNECT_VOICE):
            raise HTTPException(status_code=403, detail="No CONNECT_VOICE")
    else:
        try:
            dm_uuid = uuid.UUID(room_id.split(":", 1)[1])
        except ValueError:
            raise HTTPException(status_code=400, detail="Bad DM id")
        p_res = await db.execute(
            select(DMParticipant).where(
                DMParticipant.dm_id == dm_uuid,
                DMParticipant.user_id == current_user.id,
            )
        )
        if not p_res.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Not a DM participant")
        channel = None

    existing, _new = manager.voice_join(str(current_user.id), room_id)

    notify = {
        "event": "voice_peer_joined",
        "data": {
            "room_id": room_id,
            "user_id": str(current_user.id),
            "username": current_user.username,
        },
    }
    if room_id.startswith("channel:") and channel is not None:
        await manager.broadcast_to_server(
            str(channel.server_id), notify, exclude_user=str(current_user.id),
        )
    elif room_id.startswith("dm:"):
        dm_uuid = uuid.UUID(room_id.split(":", 1)[1])
        p_all = await db.execute(
            select(DMParticipant.user_id).where(DMParticipant.dm_id == dm_uuid)
        )
        await manager.broadcast_to_users(
            [str(uid) for (uid,) in p_all.all()], notify,
            exclude_user=str(current_user.id),
        )

    return {"ok": True, "peers": existing}


@router.delete("/presence")
async def voice_presence_leave(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    room_id, remaining, _ended = manager.voice_leave(str(current_user.id))
    if not room_id:
        return {"ok": True}
    notify = {
        "event": "voice_peer_left",
        "data": {"room_id": room_id, "user_id": str(current_user.id)},
    }
    if room_id.startswith("channel:"):
        try:
            channel_uuid = uuid.UUID(room_id.split(":", 1)[1])
            ch_res = await db.execute(select(Channel).where(Channel.id == channel_uuid))
            ch = ch_res.scalar_one_or_none()
            if ch:
                await manager.broadcast_to_server(str(ch.server_id), notify)
        except Exception:
            pass
    elif room_id.startswith("dm:"):
        try:
            dm_uuid = uuid.UUID(room_id.split(":", 1)[1])
            p_all = await db.execute(select(DMParticipant.user_id).where(DMParticipant.dm_id == dm_uuid))
            await manager.broadcast_to_users([str(uid) for (uid,) in p_all.all()], notify)
        except Exception:
            pass
    return {"ok": True}


@router.post("/join", response_model=VoiceStateResponse)
async def join_voice(
    body: VoiceJoin,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(select(Channel).where(Channel.id == body.channel_id, Channel.type == "voice"))
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Voice channel not found")

    member_result = await db.execute(
        select(ServerMember).where(
            ServerMember.server_id == channel.server_id,
            ServerMember.user_id == current_user.id,
        )
    )
    if not member_result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this server")

    vs_result = await db.execute(select(VoiceState).where(VoiceState.user_id == current_user.id))
    vs = vs_result.scalar_one_or_none()
    if vs:
        vs.channel_id = body.channel_id
        vs.server_id = channel.server_id
    else:
        vs = VoiceState(user_id=current_user.id, channel_id=body.channel_id, server_id=channel.server_id)
        db.add(vs)
    await db.flush()

    await manager.broadcast_to_server(str(channel.server_id), {
        "event": "voice_state_update",
        "data": VoiceStateResponse.model_validate(vs).model_dump(mode="json"),
    })
    return vs


@router.post("/leave", status_code=204)
async def leave_voice(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(select(VoiceState).where(VoiceState.user_id == current_user.id))
    vs = result.scalar_one_or_none()
    if not vs:
        return

    server_id = vs.server_id
    vs.channel_id = None
    vs.server_id = None
    await db.flush()

    if server_id:
        await manager.broadcast_to_server(str(server_id), {
            "event": "voice_state_update",
            "data": {"user_id": str(current_user.id), "channel_id": None, "server_id": None},
        })


@router.patch("/state", response_model=VoiceStateResponse)
async def update_voice_state(
    body: VoiceStateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(select(VoiceState).where(VoiceState.user_id == current_user.id))
    vs = result.scalar_one_or_none()
    if not vs or not vs.channel_id:
        raise HTTPException(status_code=400, detail="Not in a voice channel")

    if body.is_muted is not None:
        vs.is_muted = body.is_muted
    if body.is_deafened is not None:
        vs.is_deafened = body.is_deafened
    if body.is_sharing_screen is not None:
        vs.is_sharing_screen = body.is_sharing_screen
    if body.is_video is not None:
        vs.is_video = body.is_video
    await db.flush()

    if vs.server_id:
        await manager.broadcast_to_server(str(vs.server_id), {
            "event": "voice_state_update",
            "data": VoiceStateResponse.model_validate(vs).model_dump(mode="json"),
        })
    return vs
