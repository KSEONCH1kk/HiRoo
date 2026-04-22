import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from app.core.deps import get_db, get_current_active_user, require_server_member, compute_permissions
from app.models.role import Permissions
from app.models.user import User
from app.models.server import ServerMember
from app.models.channel import Channel
from app.models.message import Message, MessageReaction
from app.schemas.message import (
    MessageCreate, MessageUpdate, MessageResponse,
    ReactionCreate, ReactionResponse, PaginatedMessages, ReplyPreview,
)
from app.schemas.user import UserPublic
from app.services.websocket_service import manager
from app.services.notification_service import create_notification

router = APIRouter(prefix="/api/channels/{channel_id}/messages", tags=["messages"])


class MessageSearchResponse(BaseModel):
    items: list[MessageResponse]


async def _get_channel_and_member(
    channel_id: uuid.UUID,
    db: AsyncSession,
    current_user: User,
) -> tuple[Channel, ServerMember]:
    result = await db.execute(select(Channel).where(Channel.id == channel_id))
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    result = await db.execute(
        select(ServerMember).where(
            ServerMember.server_id == channel.server_id,
            ServerMember.user_id == current_user.id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this server")
    return channel, member


def _build_response(msg: Message, current_user_id: uuid.UUID) -> MessageResponse:
    reaction_map: dict[str, ReactionResponse] = {}
    for r in (msg.reactions or []):
        if r.emoji not in reaction_map:
            reaction_map[r.emoji] = ReactionResponse(emoji=r.emoji, count=0, me=False)
        reaction_map[r.emoji].count += 1
        if r.user_id == current_user_id:
            reaction_map[r.emoji].me = True
    author = UserPublic.model_validate(msg.author, from_attributes=True) if msg.author else None
    reply_to = None
    ref = getattr(msg, "reply_to", None)
    if ref:
        ref_author = UserPublic.model_validate(ref.author, from_attributes=True) if ref.author else None
        reply_to = ReplyPreview(
            id=ref.id,
            author=ref_author,
            content=(ref.content or "")[:200],
            is_deleted=ref.is_deleted,
        )
    return MessageResponse(
        id=msg.id,
        channel_id=msg.channel_id,
        author_id=msg.author_id,
        content=msg.content,
        reply_to_id=msg.reply_to_id,
        reply_to=reply_to,
        edited_at=msg.edited_at,
        is_deleted=msg.is_deleted,
        created_at=msg.created_at,
        author=author,
        reactions=list(reaction_map.values()),
        webhook_id=getattr(msg, "webhook_id", None),
        webhook_name=getattr(msg, "webhook_name", None),
        webhook_avatar_url=getattr(msg, "webhook_avatar_url", None),
        embeds=getattr(msg, "embeds", None),
        components=getattr(msg, "components", None),
        application_id=getattr(msg, "application_id", None),
    )


@router.get("/", response_model=PaginatedMessages)
async def get_messages(
    channel_id: uuid.UUID,
    before: uuid.UUID | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    channel, _ = await _get_channel_and_member(channel_id, db, current_user)
    perms = await compute_permissions(channel.server_id, current_user.id, db, channel_id=channel.id)
    if not (perms & Permissions.READ_MESSAGES):
        raise HTTPException(status_code=403, detail="Нет права читать сообщения в этом канале")

    q = (
        select(Message)
        .options(
            selectinload(Message.author),
            selectinload(Message.reactions),
            selectinload(Message.reply_to).selectinload(Message.author),
        )
        .where(Message.channel_id == channel_id, Message.is_deleted == False)
        .order_by(Message.created_at.desc())
        .limit(limit + 1)
    )
    if before:
        ref = await db.execute(select(Message.created_at).where(Message.id == before))
        ref_ts = ref.scalar_one_or_none()
        if ref_ts:
            q = q.where(Message.created_at < ref_ts)

    result = await db.execute(q)
    rows = result.scalars().all()
    has_more = len(rows) > limit
    items = list(reversed(rows[:limit]))
    next_cursor = str(items[0].id) if has_more and items else None
    return PaginatedMessages(
        items=[_build_response(m, current_user.id) for m in items],
        has_more=has_more,
        next_cursor=next_cursor,
    )


@router.post("/", response_model=MessageResponse, status_code=201)
async def send_message(
    channel_id: uuid.UUID,
    body: MessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    channel, _ = await _get_channel_and_member(channel_id, db, current_user)
    perms = await compute_permissions(channel.server_id, current_user.id, db, channel_id=channel.id)
    if not (perms & Permissions.SEND_MESSAGES):
        raise HTTPException(status_code=403, detail="Нет права отправлять сообщения в этом канале")

    import re as _re
    content_for_checks = body.content or ""
    if "/uploads/attachments/" in content_for_checks and not (perms & Permissions.ATTACH_FILES):
        raise HTTPException(status_code=403, detail="Нет права прикреплять файлы")
    if _re.search(r"(^|[^\w])@(everyone|all)\b", content_for_checks, _re.IGNORECASE) and not (perms & Permissions.MENTION_EVERYONE):
        raise HTTPException(status_code=403, detail="Нет права упоминать @everyone")

    # Bots may attach rich components + embeds and tag the message with their
    # application_id so the frontend can route button clicks back to them.
    application_id = None
    if getattr(current_user, "is_bot", False):
        from app.models.application import Bot as _Bot
        br = await db.execute(select(_Bot).where(_Bot.user_id == current_user.id))
        b = br.scalar_one_or_none()
        if b:
            application_id = b.application_id

    msg = Message(
        channel_id=channel_id,
        author_id=current_user.id,
        content=body.content or "",
        reply_to_id=body.reply_to_id,
        embeds=[e.model_dump(mode="json") for e in body.embeds] if body.embeds else None,
        components=body.components,
        application_id=application_id,
    )
    db.add(msg)
    await db.flush()

    loaded = await db.execute(
        select(Message)
        .options(
            selectinload(Message.author),
            selectinload(Message.reactions),
            selectinload(Message.reply_to).selectinload(Message.author),
        )
        .where(Message.id == msg.id)
    )
    msg = loaded.scalar_one()

    resp = _build_response(msg, current_user.id)
    payload = resp.model_dump(mode="json")
    payload["server_id"] = str(channel.server_id)
    await manager.broadcast_to_server(str(channel.server_id), {
        "event": "message_create",
        "data": payload,
    }, exclude_user=str(current_user.id))

    # Mention notifications
    import re
    mentions = re.findall(r"@(\w+)", body.content)
    mentioned_user_ids: list[str] = []
    if mentions:
        result = await db.execute(
            select(ServerMember).where(ServerMember.server_id == channel.server_id)
        )
        members = result.scalars().all()
        for member in members:
            user_result = await db.execute(
                select(User).where(User.id == member.user_id)
            )
            u = user_result.scalar_one_or_none()
            if u and u.username in mentions and u.id != current_user.id:
                await create_notification(
                    db, u.id, "mention",
                    from_user_id=current_user.id,
                    server_id=channel.server_id,
                    channel_id=channel_id,
                    content=body.content[:200],
                )
                mentioned_user_ids.append(str(u.id))

    # FCM push to offline mentioned users — so they get a notification even
    # when the app isn't running. Online users already saw it via WS.
    if mentioned_user_ids:
        offline = [uid for uid in mentioned_user_ids if not manager.is_online(uid)]
        if offline:
            try:
                from app.services.fcm import send_to_user as _fcm
                import asyncio as _asyncio
                author_name = current_user.display_name or current_user.username
                ch_title = f"#{channel.name}" if getattr(channel, "name", None) else ""
                await _asyncio.gather(*[
                    _fcm(uid,
                         title=f"{author_name} {ch_title}".strip(),
                         body=(body.content or "")[:240],
                         data={"channel_id": str(channel_id),
                               "server_id": str(channel.server_id)})
                    for uid in offline
                ], return_exceptions=True)
            except Exception:
                import logging
                logging.getLogger("hiroo.fcm").exception("mention push failed")

    return resp


@router.get("/search", response_model=MessageSearchResponse)
async def search_channel_messages(
    channel_id: uuid.UUID,
    q: str = Query("", max_length=200),
    author_id: uuid.UUID | None = Query(None),
    before: datetime | None = Query(None),
    after: datetime | None = Query(None),
    has: str | None = Query(None, pattern="^(link|file|image)$"),
    limit: int = Query(30, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    channel, _ = await _get_channel_and_member(channel_id, db, current_user)
    stmt = (
        select(Message)
        .options(
            selectinload(Message.author),
            selectinload(Message.reactions),
            selectinload(Message.reply_to).selectinload(Message.author),
        )
        .where(Message.channel_id == channel_id, Message.is_deleted == False)
    )
    q_clean = q.strip()
    if q_clean:
        stmt = stmt.where(Message.content.ilike(f"%{q_clean}%"))
    if author_id:
        stmt = stmt.where(Message.author_id == author_id)
    if after:
        stmt = stmt.where(Message.created_at > after)
    if before:
        stmt = stmt.where(Message.created_at < before)
    if has == "link":
        stmt = stmt.where(or_(
            Message.content.ilike("%http://%"),
            Message.content.ilike("%https://%"),
        ))
    elif has == "file":
        stmt = stmt.where(Message.content.ilike("%/uploads/%"))
    elif has == "image":
        stmt = stmt.where(or_(
            Message.content.ilike("%.png%"),
            Message.content.ilike("%.jpg%"),
            Message.content.ilike("%.jpeg%"),
            Message.content.ilike("%.gif%"),
            Message.content.ilike("%.webp%"),
        ))
    stmt = stmt.order_by(Message.created_at.desc()).limit(limit)
    res = await db.execute(stmt)
    rows = res.scalars().all()
    return MessageSearchResponse(items=[_build_response(m, current_user.id) for m in rows])


@router.patch("/{message_id}", response_model=MessageResponse)
async def edit_message(
    channel_id: uuid.UUID,
    message_id: uuid.UUID,
    body: MessageUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(
        select(Message).where(Message.id == message_id, Message.channel_id == channel_id)
    )
    msg = result.scalar_one_or_none()
    if not msg or msg.is_deleted:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot edit someone else's message")

    msg.content = body.content
    msg.edited_at = datetime.now(timezone.utc)
    await db.flush()

    channel, _ = await _get_channel_and_member(channel_id, db, current_user)
    loaded = await db.execute(
        select(Message)
        .options(
            selectinload(Message.author),
            selectinload(Message.reactions),
            selectinload(Message.reply_to).selectinload(Message.author),
        )
        .where(Message.id == msg.id)
    )
    msg = loaded.scalar_one()
    resp = _build_response(msg, current_user.id)
    await manager.broadcast_to_server(str(channel.server_id), {
        "event": "message_update",
        "data": resp.model_dump(mode="json"),
    })
    return resp


@router.delete("/{message_id}", status_code=204)
async def delete_message(
    channel_id: uuid.UUID,
    message_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(
        select(Message).where(Message.id == message_id, Message.channel_id == channel_id)
    )
    msg = result.scalar_one_or_none()
    if not msg or msg.is_deleted:
        raise HTTPException(status_code=404, detail="Message not found")

    channel, member = await _get_channel_and_member(channel_id, db, current_user)
    perms = await compute_permissions(channel.server_id, current_user.id, db, channel_id=channel.id)
    if msg.author_id != current_user.id and not (perms & Permissions.MANAGE_MESSAGES):
        raise HTTPException(status_code=403, detail="Cannot delete this message")

    msg.is_deleted = True
    msg.content = "[deleted]"
    await db.flush()

    await manager.broadcast_to_server(str(channel.server_id), {
        "event": "message_delete",
        "data": {"message_id": str(message_id), "channel_id": str(channel_id)},
    })


@router.post("/{message_id}/reactions", status_code=204)
async def add_reaction(
    channel_id: uuid.UUID,
    message_id: uuid.UUID,
    body: ReactionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    channel, _ = await _get_channel_and_member(channel_id, db, current_user)
    perms = await compute_permissions(channel.server_id, current_user.id, db, channel_id=channel.id)
    if not (perms & Permissions.ADD_REACTIONS):
        raise HTTPException(status_code=403, detail="Нет права добавлять реакции")
    result = await db.execute(
        select(MessageReaction).where(
            MessageReaction.message_id == message_id,
            MessageReaction.user_id == current_user.id,
            MessageReaction.emoji == body.emoji,
        )
    )
    if result.scalar_one_or_none():
        return  # already reacted

    db.add(MessageReaction(message_id=message_id, user_id=current_user.id, emoji=body.emoji))
    await db.flush()

    await manager.broadcast_to_server(str(channel.server_id), {
        "event": "reaction_add",
        "data": {
            "message_id": str(message_id),
            "channel_id": str(channel_id),
            "user_id": str(current_user.id),
            "emoji": body.emoji,
        },
    }, exclude_user=str(current_user.id))


@router.delete("/{message_id}/reactions", status_code=204)
async def remove_reaction(
    channel_id: uuid.UUID,
    message_id: uuid.UUID,
    emoji: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    channel, _ = await _get_channel_and_member(channel_id, db, current_user)
    result = await db.execute(
        select(MessageReaction).where(
            MessageReaction.message_id == message_id,
            MessageReaction.user_id == current_user.id,
            MessageReaction.emoji == emoji,
        )
    )
    reaction = result.scalar_one_or_none()
    if reaction:
        await db.delete(reaction)
        await db.flush()
        await manager.broadcast_to_server(str(channel.server_id), {
            "event": "reaction_remove",
            "data": {
                "message_id": str(message_id),
                "channel_id": str(channel_id),
                "user_id": str(current_user.id),
                "emoji": emoji,
            },
        }, exclude_user=str(current_user.id))
