import json
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.security import verify_access_token
from app.core.deps import get_db, get_redis
from app.models.user import User
from app.models.server import ServerMember
from app.models.channel import Channel
from app.models.dm import DMParticipant, DMMessage, DirectMessage
from app.schemas.message import DMMessageResponse, ReactionResponse
from app.schemas.user import UserPublic
from app.services.websocket_service import manager
import redis.asyncio as aioredis


async def _dm_participant_ids(db: AsyncSession, dm_id: uuid.UUID) -> list[str]:
    res = await db.execute(
        select(DMParticipant.user_id).where(DMParticipant.dm_id == dm_id)
    )
    return [str(r[0]) for r in res.all()]


def _dm_msg_payload(msg: DMMessage, content_override: str | None = None) -> dict:
    author = (
        UserPublic.model_validate(msg.author, from_attributes=True).model_dump(mode="json")
        if msg.author else None
    )
    payload = DMMessageResponse(
        id=msg.id,
        dm_id=msg.dm_id,
        author_id=msg.author_id,
        type=getattr(msg, "type", "text") or "text",
        content=content_override if content_override is not None else msg.content,
        edited_at=msg.edited_at,
        is_deleted=msg.is_deleted,
        created_at=msg.created_at,
        author=None,
        reactions=[],
    ).model_dump(mode="json")
    payload["author"] = author
    return payload


async def _log_call_started(
    db: AsyncSession,
    room_id: str,
    starter_id: str,
) -> None:
    """Insert an 'ongoing' call_log DMMessage when first user joins a DM room."""
    if not room_id.startswith("dm:"):
        return
    try:
        dm_uuid = uuid.UUID(room_id.split(":", 1)[1])
    except (ValueError, IndexError):
        return
    try:
        starter_uuid = uuid.UUID(starter_id)
    except (ValueError, TypeError):
        starter_uuid = None
    now = datetime.now(timezone.utc)
    msg = DMMessage(
        dm_id=dm_uuid,
        author_id=starter_uuid,
        type="call_log",
        content="ongoing",
        created_at=now,
    )
    db.add(msg)
    dm_res = await db.execute(select(DirectMessage).where(DirectMessage.id == dm_uuid))
    dm = dm_res.scalar_one_or_none()
    if dm:
        dm.updated_at = now
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        return

    loaded = await db.execute(
        select(DMMessage)
        .options(selectinload(DMMessage.author), selectinload(DMMessage.reactions))
        .where(DMMessage.id == msg.id)
    )
    stored = loaded.scalar_one_or_none()
    if not stored:
        return

    await manager.set_call_log_msg_id(room_id, str(stored.id))
    payload = _dm_msg_payload(stored)
    part_ids = await _dm_participant_ids(db, dm_uuid)
    await manager.broadcast_to_users(part_ids, {"event": "dm_message_create", "data": payload})


async def _log_call_ended(
    db: AsyncSession,
    room_id: str,
    started_at: datetime,
    starter_id: str,
    call_log_msg_id: str | None,
) -> None:
    """Update the existing 'ongoing' call_log with final duration, or insert one if missing."""
    if not room_id.startswith("dm:"):
        return
    try:
        dm_uuid = uuid.UUID(room_id.split(":", 1)[1])
    except (ValueError, IndexError):
        return
    try:
        starter_uuid = uuid.UUID(starter_id)
    except (ValueError, TypeError):
        starter_uuid = None
    duration = max(0, int((datetime.now(timezone.utc) - started_at).total_seconds()))

    existing = None
    if call_log_msg_id:
        try:
            existing_uuid = uuid.UUID(call_log_msg_id)
        except (ValueError, TypeError):
            existing_uuid = None
        if existing_uuid:
            res = await db.execute(
                select(DMMessage)
                .options(selectinload(DMMessage.author), selectinload(DMMessage.reactions))
                .where(DMMessage.id == existing_uuid)
            )
            existing = res.scalar_one_or_none()

    if existing:
        existing.content = str(duration)
        try:
            await db.commit()
        except Exception:
            await db.rollback()
            return
        reloaded = await db.execute(
            select(DMMessage)
            .options(selectinload(DMMessage.author), selectinload(DMMessage.reactions))
            .where(DMMessage.id == existing.id)
        )
        stored = reloaded.scalar_one_or_none()
        if not stored:
            return
        payload = _dm_msg_payload(stored)
        part_ids = await _dm_participant_ids(db, dm_uuid)
        await manager.broadcast_to_users(part_ids, {"event": "dm_message_update", "data": payload})
        return

    # Fallback: no pre-existing log — insert a fresh one with duration
    now = datetime.now(timezone.utc)
    msg = DMMessage(
        dm_id=dm_uuid,
        author_id=starter_uuid,
        type="call_log",
        content=str(duration),
        created_at=now,
    )
    db.add(msg)
    dm_res = await db.execute(select(DirectMessage).where(DirectMessage.id == dm_uuid))
    dm = dm_res.scalar_one_or_none()
    if dm:
        dm.updated_at = now
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        return
    loaded = await db.execute(
        select(DMMessage)
        .options(selectinload(DMMessage.author), selectinload(DMMessage.reactions))
        .where(DMMessage.id == msg.id)
    )
    stored = loaded.scalar_one_or_none()
    if not stored:
        return
    payload = _dm_msg_payload(stored)
    part_ids = await _dm_participant_ids(db, dm_uuid)
    await manager.broadcast_to_users(part_ids, {"event": "dm_message_create", "data": payload})

router = APIRouter(tags=["websocket"])


@router.websocket("/ws")
async def websocket_endpoint(
    ws: WebSocket,
    token: str | None = Query(None),
    compress: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    await ws.accept()
    user: User | None = None
    # Нормализуем запрошенный режим компрессии. Пока поддерживаем только
    # "zlib-stream" — единый deflate-стрим на соединение (см. Discord).
    compression = compress if compress == "zlib-stream" else None

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

        # Register connection — и здесь же создаём deflate-стрим, если
        # клиент попросил компрессию. Все последующие send_* через
        # manager пойдут через compressor.
        await manager.connect(str(user.id), ws, compression=compression)

        # Join all servers user belongs to
        result = await db.execute(
            select(ServerMember.server_id).where(ServerMember.user_id == user.id)
        )
        for (sid,) in result.all():
            manager.join_server(str(sid), str(user.id))

        await manager.send_to_socket(ws, {
            "event": "ready",
            "data": {
                "user_id": str(user.id),
                "server_muted": manager.is_server_muted(str(user.id)),
                "server_deafened": manager.is_server_deafened(str(user.id)),
            },
        })

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
        _all_rooms = await manager.voice_all_rooms()
        for room_id, members in _all_rooms.items():
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
            elif room_id.startswith("dm:"):
                try:
                    dm_uuid = uuid.UUID(room_id.split(":", 1)[1])
                except Exception:
                    continue
                p_res = await db.execute(
                    select(DMParticipant).where(
                        DMParticipant.dm_id == dm_uuid,
                        DMParticipant.user_id == user.id,
                    )
                )
                if p_res.scalar_one_or_none():
                    snapshot[room_id] = list(members)
        # Collect muted/deafened users relevant to this user's rooms
        relevant_users: set[str] = set()
        for members in snapshot.values():
            for uid in members:
                relevant_users.add(uid)
        muted_list = [u for u in relevant_users if manager.is_server_muted(u)]
        deafened_list = [u for u in relevant_users if manager.is_server_deafened(u)]
        if snapshot or muted_list or deafened_list:
            await manager.send_to_socket(ws, {
                "event": "voice_snapshot",
                "data": {
                    "rooms": snapshot,
                    "muted_users": muted_list,
                    "deafened_users": deafened_list,
                },
            })

        # Main receive loop
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            event = data.get("event")
            payload = data.get("data", {})

            if event in ("typing_start", "typing_stop"):
                is_typing = event == "typing_start"
                channel_id = payload.get("channel_id")
                dm_id = payload.get("dm_id")
                typing_data = {
                    "event": "typing",
                    "data": {
                        "user_id": str(user.id),
                        "username": user.username,
                        "display_name": user.display_name,
                        "channel_id": channel_id,
                        "dm_id": dm_id,
                        "is_typing": is_typing,
                    },
                }
                if dm_id:
                    try:
                        dm_uuid = uuid.UUID(dm_id)
                    except (ValueError, TypeError):
                        continue
                    part_ids = await _dm_participant_ids(db, dm_uuid)
                    if str(user.id) in part_ids:
                        await manager.broadcast_to_users(
                            part_ids, typing_data, exclude_user=str(user.id)
                        )
                else:
                    await manager.broadcast_to_server(
                        payload.get("server_id", ""),
                        typing_data,
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
                # Enforce CONNECT_VOICE for channel rooms (with channel override)
                if room_id.startswith("channel:"):
                    try:
                        ch_uuid = uuid.UUID(room_id.split(":", 1)[1])
                    except (ValueError, IndexError):
                        continue
                    ch_res_auth = await db.execute(select(Channel).where(Channel.id == ch_uuid))
                    ch_auth = ch_res_auth.scalar_one_or_none()
                    if not ch_auth:
                        continue
                    from app.core.deps import compute_permissions as _cp
                    from app.models.role import Permissions as _Perms
                    perms = await _cp(ch_auth.server_id, user.id, db, channel_id=ch_auth.id)
                    if (perms & _Perms.CONNECT_VOICE) == 0:
                        await manager.send_to_socket(ws, {
                            "event": "error",
                            "data": {"message": "Нет права подключаться к этому каналу"},
                        })
                        continue
                existing, is_new_call = await manager.voice_join(str(user.id), room_id)
                await manager.send_to_socket(ws, {
                    "event": "voice_room_joined",
                    "data": {"room_id": room_id, "peers": existing},
                })
                if is_new_call and room_id.startswith("dm:"):
                    try:
                        await _log_call_started(db, room_id, str(user.id))
                    except Exception:
                        try: await db.rollback()
                        except Exception: pass
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
                if room_id.startswith("dm:"):
                    try:
                        dm_uuid = uuid.UUID(room_id.split(":", 1)[1])
                        part_ids = await _dm_participant_ids(db, dm_uuid)
                        await manager.broadcast_to_users(
                            part_ids, notify_data, exclude_user=str(user.id)
                        )
                        continue
                    except Exception:
                        pass
                for peer_id in existing:
                    await manager.send_to_user(peer_id, notify_data)

            elif event == "voice_leave":
                room_id, remaining, ended_meta = await manager.voice_leave(str(user.id))
                if not room_id:
                    continue
                if ended_meta:
                    started_at, starter_id, log_msg_id = ended_meta
                    try:
                        await _log_call_ended(db, room_id, started_at, starter_id, log_msg_id)
                    except Exception:
                        try: await db.rollback()
                        except Exception: pass
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
                if room_id.startswith("dm:"):
                    try:
                        dm_uuid = uuid.UUID(room_id.split(":", 1)[1])
                        part_ids = await _dm_participant_ids(db, dm_uuid)
                        await manager.broadcast_to_users(
                            part_ids, notify_data, exclude_user=str(user.id)
                        )
                        continue
                    except Exception:
                        pass
                for peer_id in remaining:
                    await manager.send_to_user(peer_id, notify_data)

            elif event == "voice_force_move":
                target_id = payload.get("target_user_id")
                to_room = payload.get("to_room_id")
                if not target_id or not to_room or not to_room.startswith("channel:"):
                    continue
                try:
                    to_ch_uuid = uuid.UUID(to_room.split(":", 1)[1])
                except (ValueError, IndexError):
                    continue
                # Destination channel must be a voice channel on a server where initiator has MOVE_MEMBERS
                ch_res = await db.execute(select(Channel).where(Channel.id == to_ch_uuid))
                to_channel = ch_res.scalar_one_or_none()
                if not to_channel or to_channel.type != "voice":
                    continue
                from app.core.deps import compute_permissions as _cp
                from app.models.role import Permissions as _Perms
                perms = await _cp(to_channel.server_id, user.id, db)
                if (perms & _Perms.MOVE_MEMBERS) != _Perms.MOVE_MEMBERS and (perms & _Perms.ADMIN) == 0:
                    continue
                # Target must be on same server
                mem_res = await db.execute(
                    select(ServerMember).where(
                        ServerMember.server_id == to_channel.server_id,
                        ServerMember.user_id == uuid.UUID(target_id),
                    )
                )
                if not mem_res.scalar_one_or_none():
                    continue
                current_room = await manager.voice_room_of(target_id)
                if current_room == to_room:
                    continue
                await manager.send_to_user(target_id, {
                    "event": "voice_force_move",
                    "data": {
                        "to_room_id": to_room,
                        "from_user_id": str(user.id),
                    },
                })

            elif event in (
                "voice_force_disconnect",
                "voice_force_mute", "voice_force_unmute",
                "voice_force_deafen", "voice_force_undeafen",
            ):
                target_id = payload.get("target_user_id")
                if not target_id:
                    continue
                # Target must be in a voice room
                current_room = await manager.voice_room_of(target_id)
                if not current_room or not current_room.startswith("channel:"):
                    continue
                try:
                    ch_uuid = uuid.UUID(current_room.split(":", 1)[1])
                except (ValueError, IndexError):
                    continue
                ch_res = await db.execute(select(Channel).where(Channel.id == ch_uuid))
                ch_row = ch_res.scalar_one_or_none()
                if not ch_row:
                    continue
                from app.core.deps import compute_permissions as _cp
                from app.models.role import Permissions as _Perms
                admin_perms = await _cp(ch_row.server_id, user.id, db)
                need = {
                    "voice_force_disconnect": _Perms.MOVE_MEMBERS,
                    "voice_force_mute": _Perms.MUTE_MEMBERS,
                    "voice_force_unmute": _Perms.MUTE_MEMBERS,
                    "voice_force_deafen": _Perms.DEAFEN_MEMBERS,
                    "voice_force_undeafen": _Perms.DEAFEN_MEMBERS,
                }[event]
                if (admin_perms & need) == 0 and (admin_perms & _Perms.ADMIN) == 0:
                    continue
                # Persist server-imposed state
                if event == "voice_force_mute":
                    manager.set_server_muted(target_id, True)
                elif event == "voice_force_unmute":
                    manager.set_server_muted(target_id, False)
                elif event == "voice_force_deafen":
                    manager.set_server_deafened(target_id, True)
                elif event == "voice_force_undeafen":
                    manager.set_server_deafened(target_id, False)
                await manager.send_to_user(target_id, {
                    "event": event,
                    "data": {"from_user_id": str(user.id)},
                })
                # Broadcast state change to server so other admins see current state
                if event != "voice_force_disconnect":
                    await manager.broadcast_to_server(str(ch_row.server_id), {
                        "event": "voice_user_state",
                        "data": {
                            "user_id": target_id,
                            "server_muted": manager.is_server_muted(target_id),
                            "server_deafened": manager.is_server_deafened(target_id),
                        },
                    })

            elif event == "voice_mls_bundle":
                room_id = payload.get("room_id")
                bundle = payload.get("bundle")
                if not room_id or not bundle:
                    continue
                if await manager.voice_room_of(str(user.id)) != room_id:
                    continue  # sender must be in that room
                peers = await manager.voice_room_members(room_id)
                for peer_id in peers:
                    if peer_id == str(user.id):
                        continue
                    await manager.send_to_user(peer_id, {
                        "event": "voice_mls_bundle",
                        "data": {
                            "room_id": room_id,
                            "from_user_id": str(user.id),
                            "bundle": bundle,
                        },
                    })

            elif event == "voice_key_distribute":
                # Per-sender E2EE key relay: sender encrypts its frame-key with
                # recipient's box public key (sealed_box) and asks us to deliver it.
                room_id = payload.get("room_id")
                target_user_id = payload.get("target_user_id")
                sealed = payload.get("sealed")
                if not room_id or not target_user_id or not sealed:
                    continue
                if await manager.voice_room_of(str(user.id)) != room_id:
                    continue
                if await manager.voice_room_of(str(target_user_id)) != room_id:
                    continue
                await manager.send_to_user(str(target_user_id), {
                    "event": "voice_key_distribute",
                    "data": {
                        "room_id": room_id,
                        "from_user_id": str(user.id),
                        "sealed": sealed,
                    },
                })

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
                    # High-priority push so the phone rings even if the app is
                    # killed / dozing — Android delivers FCM HIGH priority
                    # within seconds. Data payload lets the client optionally
                    # open the incoming-call UI on tap.
                    if not await manager.is_online(str(target_id)):
                        try:
                            from app.services.fcm import send_to_user as _fcm
                            name = user.display_name or user.username
                            is_video = bool(payload.get("video", False))
                            await _fcm(str(target_id),
                                       title=f"{name} звонит вам",
                                       body=("Видеозвонок" if is_video else "Голосовой звонок"),
                                       data={"kind": "voice_ring",
                                             "room_id": str(room_id),
                                             "from_user_id": str(user.id),
                                             "video": "1" if is_video else "0"})
                        except Exception:
                            import logging as _l
                            _l.getLogger("hiroo.fcm").exception("voice_ring push failed")

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

            elif event == "soundboard_play":
                # Sender must be in the referenced room and have USE_SOUNDBOARD
                # for the server that owns the sound. We fan out a lightweight
                # event with the sound URL; each receiver plays it locally and
                # enforces its own per-user mute list.
                sound_id = payload.get("sound_id")
                room_id = payload.get("room_id")
                if not sound_id or not room_id:
                    continue
                try:
                    sid_uuid = uuid.UUID(sound_id)
                except (ValueError, TypeError):
                    continue
                if await manager.voice_room_of(str(user.id)) != room_id:
                    continue

                from app.models.soundboard import SoundboardSound
                sr = await db.execute(
                    select(SoundboardSound).where(SoundboardSound.id == sid_uuid)
                )
                sound = sr.scalar_one_or_none()
                if not sound:
                    continue

                # Permission check — must be a member of the sound's server
                # and have USE_SOUNDBOARD (or ADMIN).
                from app.core.deps import compute_permissions as _cp
                from app.models.role import Permissions as _Perms
                mem_res = await db.execute(
                    select(ServerMember).where(
                        ServerMember.server_id == sound.server_id,
                        ServerMember.user_id == user.id,
                    )
                )
                if not mem_res.scalar_one_or_none():
                    continue
                perms = await _cp(sound.server_id, user.id, db)
                if not ((perms & _Perms.USE_SOUNDBOARD) or (perms & _Perms.ADMIN)):
                    await manager.send_to_socket(ws, {
                        "event": "error",
                        "data": {"message": "Нет права использовать звуки этого сервера"},
                    })
                    continue

                # Also enforce channel-level CONNECT_VOICE / SPEAK_VOICE if
                # we're in a server voice channel.
                if room_id.startswith("channel:"):
                    try:
                        ch_uuid = uuid.UUID(room_id.split(":", 1)[1])
                    except (ValueError, IndexError):
                        continue
                    ch_res = await db.execute(select(Channel).where(Channel.id == ch_uuid))
                    ch = ch_res.scalar_one_or_none()
                    if not ch:
                        continue
                    ch_perms = await _cp(ch.server_id, user.id, db, channel_id=ch.id)
                    if not ((ch_perms & _Perms.SPEAK_VOICE) or (ch_perms & _Perms.ADMIN)):
                        continue

                url = f"/uploads/{sound.file_path}"
                peers = await manager.voice_room_members(room_id)
                for peer_id in peers:
                    if peer_id == str(user.id):
                        continue
                    await manager.send_to_user(peer_id, {
                        "event": "soundboard_play_remote",
                        "data": {
                            "room_id": room_id,
                            "from_user_id": str(user.id),
                            "sound_id": str(sound.id),
                            "name": sound.name,
                            "emoji": sound.emoji,
                            "url": url,
                        },
                    })

    except WebSocketDisconnect:
        pass
    finally:
        if user:
            # Leave voice room if any
            room_id, remaining, ended_meta = await manager.voice_leave(str(user.id))
            if room_id and ended_meta:
                started_at, starter_id, log_msg_id = ended_meta
                try:
                    await _log_call_ended(db, room_id, started_at, starter_id, log_msg_id)
                except Exception:
                    try: await db.rollback()
                    except Exception: pass
            if room_id:
                notify_data = {
                    "event": "voice_peer_left",
                    "data": {"room_id": room_id, "user_id": str(user.id)},
                }
                broadcasted = False
                if room_id.startswith("channel:"):
                    channel_uuid_str = room_id.split(":", 1)[1]
                    try:
                        ch_res = await db.execute(
                            select(Channel).where(Channel.id == uuid.UUID(channel_uuid_str))
                        )
                        channel = ch_res.scalar_one_or_none()
                        if channel:
                            await manager.broadcast_to_server(str(channel.server_id), notify_data)
                            broadcasted = True
                    except Exception:
                        pass
                elif room_id.startswith("dm:"):
                    try:
                        dm_uuid = uuid.UUID(room_id.split(":", 1)[1])
                        part_ids = await _dm_participant_ids(db, dm_uuid)
                        await manager.broadcast_to_users(part_ids, notify_data)
                        broadcasted = True
                    except Exception:
                        pass
                if not broadcasted:
                    for peer_id in remaining:
                        await manager.send_to_user(peer_id, notify_data)
            await manager.disconnect(str(user.id), ws)
            if not await manager.is_online(str(user.id)):
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
