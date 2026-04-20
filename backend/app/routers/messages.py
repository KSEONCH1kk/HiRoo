import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.core.deps import get_db, get_current_active_user, require_server_member, compute_permissions
from app.models.role import Permissions
from app.models.user import User
from app.models.server import ServerMember
from app.models.channel import Channel
from app.models.message import Message, MessageReaction
from app.schemas.message import (
    MessageCreate, MessageUpdate, MessageResponse,
    ReactionCreate, ReactionResponse, PaginatedMessages,
)
from app.schemas.user import UserPublic
from app.services.websocket_service import manager
from app.services.notification_service import create_notification

router = APIRouter(prefix="/api/channels/{channel_id}/messages", tags=["messages"])


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
    return MessageResponse(
        id=msg.id,
        channel_id=msg.channel_id,
        author_id=msg.author_id,
        content=msg.content,
        reply_to_id=msg.reply_to_id,
        edited_at=msg.edited_at,
        is_deleted=msg.is_deleted,
        created_at=msg.created_at,
        author=author,
        reactions=list(reaction_map.values()),
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

    q = (
        select(Message)
        .options(selectinload(Message.author), selectinload(Message.reactions))
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
    perms = await compute_permissions(channel.server_id, current_user.id, db)
    if not (perms & Permissions.SEND_MESSAGES):
        raise HTTPException(status_code=403, detail="Нет права отправлять сообщения в этом канале")

    msg = Message(
        channel_id=channel_id,
        author_id=current_user.id,
        content=body.content,
        reply_to_id=body.reply_to_id,
    )
    db.add(msg)
    await db.flush()

    loaded = await db.execute(
        select(Message)
        .options(selectinload(Message.author), selectinload(Message.reactions))
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
    return resp


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
        .options(selectinload(Message.author), selectinload(Message.reactions))
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
    perms = await compute_permissions(channel.server_id, current_user.id, db)
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
