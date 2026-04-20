import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from pydantic import BaseModel, Field
from app.core.deps import get_db, get_current_active_user
from app.models.user import User
from app.models.dm import DirectMessage, DMParticipant, DMMessage, DMMessageReaction
from app.schemas.dm import DMCreate, DMResponse
from app.schemas.message import DMMessageCreate, DMMessageResponse, PaginatedDMMessages, ReactionResponse
from app.schemas.user import UserPublic
from app.services.websocket_service import manager


def _build_dm_response(msg: DMMessage, current_user_id: uuid.UUID) -> DMMessageResponse:
    reaction_map: dict[str, ReactionResponse] = {}
    for r in (msg.reactions or []):
        if r.emoji not in reaction_map:
            reaction_map[r.emoji] = ReactionResponse(emoji=r.emoji, count=0, me=False)
        reaction_map[r.emoji].count += 1
        if r.user_id == current_user_id:
            reaction_map[r.emoji].me = True
    author = UserPublic.model_validate(msg.author, from_attributes=True) if msg.author else None
    return DMMessageResponse(
        id=msg.id,
        dm_id=msg.dm_id,
        author_id=msg.author_id,
        content=msg.content,
        edited_at=msg.edited_at,
        is_deleted=msg.is_deleted,
        created_at=msg.created_at,
        author=author,
        reactions=list(reaction_map.values()),
    )


class DMReactionCreate(BaseModel):
    emoji: str = Field(..., min_length=1, max_length=32)

router = APIRouter(prefix="/api/dms", tags=["dms"])


async def _require_dm_participant(dm_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> DMParticipant:
    result = await db.execute(
        select(DMParticipant).where(DMParticipant.dm_id == dm_id, DMParticipant.user_id == user_id)
    )
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=403, detail="Not a participant of this DM")
    return p


def _dm_with_participants():
    return select(DirectMessage).options(
        selectinload(DirectMessage.participants).selectinload(DMParticipant.user)
    )


@router.get("", response_model=list[DMResponse])
@router.get("/", response_model=list[DMResponse], include_in_schema=False)
async def list_dms(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(
        select(DMParticipant.dm_id).where(DMParticipant.user_id == current_user.id)
    )
    dm_ids = [r[0] for r in result.all()]
    if not dm_ids:
        return []
    result = await db.execute(
        _dm_with_participants()
        .where(DirectMessage.id.in_(dm_ids))
        .order_by(DirectMessage.updated_at.desc())
    )
    return result.scalars().unique().all()


@router.get("/{dm_id}", response_model=DMResponse)
async def get_dm(
    dm_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await _require_dm_participant(dm_id, current_user.id, db)
    result = await db.execute(_dm_with_participants().where(DirectMessage.id == dm_id))
    dm = result.scalars().unique().one_or_none()
    if not dm:
        raise HTTPException(status_code=404, detail="DM not found")
    return dm


@router.post("", response_model=DMResponse, status_code=201)
@router.post("/", response_model=DMResponse, status_code=201, include_in_schema=False)
async def create_dm(
    body: DMCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    all_ids = list({current_user.id, *body.user_ids})
    is_group = len(all_ids) > 2

    if not is_group:
        other_id = next(i for i in all_ids if i != current_user.id)
        existing = await db.execute(
            select(DirectMessage.id)
            .join(DMParticipant, DMParticipant.dm_id == DirectMessage.id)
            .where(DMParticipant.user_id == current_user.id, DirectMessage.is_group == False)
        )
        for (existing_dm_id,) in existing.all():
            parts = await db.execute(
                select(DMParticipant.user_id).where(DMParticipant.dm_id == existing_dm_id)
            )
            part_ids = {r[0] for r in parts.all()}
            if part_ids == {current_user.id, other_id}:
                loaded = await db.execute(
                    _dm_with_participants().where(DirectMessage.id == existing_dm_id)
                )
                return loaded.scalars().unique().one()

    dm = DirectMessage(is_group=is_group, name=body.name if is_group else None)
    db.add(dm)
    await db.flush()

    for uid in all_ids:
        db.add(DMParticipant(dm_id=dm.id, user_id=uid))
    await db.flush()

    loaded = await db.execute(_dm_with_participants().where(DirectMessage.id == dm.id))
    return loaded.scalars().unique().one()


@router.get("/{dm_id}/messages", response_model=PaginatedDMMessages)
async def get_dm_messages(
    dm_id: uuid.UUID,
    before: uuid.UUID | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await _require_dm_participant(dm_id, current_user.id, db)

    q = (
        select(DMMessage)
        .options(selectinload(DMMessage.author), selectinload(DMMessage.reactions))
        .where(DMMessage.dm_id == dm_id, DMMessage.is_deleted == False)
        .order_by(DMMessage.created_at.desc())
        .limit(limit + 1)
    )
    if before:
        ref = await db.execute(select(DMMessage.created_at).where(DMMessage.id == before))
        ref_ts = ref.scalar_one_or_none()
        if ref_ts:
            q = q.where(DMMessage.created_at < ref_ts)

    result = await db.execute(q)
    rows = result.scalars().all()
    has_more = len(rows) > limit
    items = list(reversed(rows[:limit]))
    return PaginatedDMMessages(
        items=[_build_dm_response(m, current_user.id) for m in items],
        has_more=has_more,
        next_cursor=str(items[0].id) if has_more and items else None,
    )


@router.post("/{dm_id}/messages", response_model=DMMessageResponse, status_code=201)
async def send_dm_message(
    dm_id: uuid.UUID,
    body: DMMessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await _require_dm_participant(dm_id, current_user.id, db)

    msg = DMMessage(dm_id=dm_id, author_id=current_user.id, content=body.content)
    db.add(msg)

    dm_result = await db.execute(select(DirectMessage).where(DirectMessage.id == dm_id))
    dm = dm_result.scalar_one()
    dm.updated_at = datetime.now(timezone.utc)

    await db.flush()

    loaded = await db.execute(
        select(DMMessage)
        .options(selectinload(DMMessage.author), selectinload(DMMessage.reactions))
        .where(DMMessage.id == msg.id)
    )
    msg = loaded.scalar_one()

    participants = await db.execute(
        select(DMParticipant.user_id).where(DMParticipant.dm_id == dm_id)
    )
    part_ids = [str(r[0]) for r in participants.all()]

    resp = _build_dm_response(msg, current_user.id)
    await manager.broadcast_to_users(part_ids, {
        "event": "dm_message_create",
        "data": resp.model_dump(mode="json"),
    }, exclude_user=str(current_user.id))
    return resp


@router.patch("/{dm_id}/messages/{msg_id}", response_model=DMMessageResponse)
async def edit_dm_message(
    dm_id: uuid.UUID,
    msg_id: uuid.UUID,
    body: DMMessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await _require_dm_participant(dm_id, current_user.id, db)
    result = await db.execute(select(DMMessage).where(DMMessage.id == msg_id, DMMessage.dm_id == dm_id))
    msg = result.scalar_one_or_none()
    if not msg or msg.is_deleted:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot edit someone else's message")
    msg.content = body.content
    msg.edited_at = datetime.now(timezone.utc)
    await db.flush()

    loaded = await db.execute(
        select(DMMessage)
        .options(selectinload(DMMessage.author), selectinload(DMMessage.reactions))
        .where(DMMessage.id == msg.id)
    )
    msg = loaded.scalar_one()

    parts = await db.execute(select(DMParticipant.user_id).where(DMParticipant.dm_id == dm_id))
    part_ids = [str(r[0]) for r in parts.all()]
    resp = _build_dm_response(msg, current_user.id)
    await manager.broadcast_to_users(part_ids, {
        "event": "dm_message_update",
        "data": resp.model_dump(mode="json"),
    }, exclude_user=str(current_user.id))
    return resp


@router.delete("/{dm_id}/messages/{msg_id}", status_code=204)
async def delete_dm_message(
    dm_id: uuid.UUID,
    msg_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await _require_dm_participant(dm_id, current_user.id, db)
    result = await db.execute(select(DMMessage).where(DMMessage.id == msg_id, DMMessage.dm_id == dm_id))
    msg = result.scalar_one_or_none()
    if not msg or msg.is_deleted:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot delete someone else's message")
    msg.is_deleted = True
    msg.content = "[deleted]"
    await db.flush()

    parts = await db.execute(select(DMParticipant.user_id).where(DMParticipant.dm_id == dm_id))
    part_ids = [str(r[0]) for r in parts.all()]
    await manager.broadcast_to_users(part_ids, {
        "event": "dm_message_delete",
        "data": {"dm_id": str(dm_id), "message_id": str(msg_id)},
    })


@router.post("/{dm_id}/messages/{msg_id}/reactions", status_code=204)
async def add_dm_reaction(
    dm_id: uuid.UUID,
    msg_id: uuid.UUID,
    body: DMReactionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await _require_dm_participant(dm_id, current_user.id, db)
    result = await db.execute(
        select(DMMessageReaction).where(
            DMMessageReaction.message_id == msg_id,
            DMMessageReaction.user_id == current_user.id,
            DMMessageReaction.emoji == body.emoji,
        )
    )
    if result.scalar_one_or_none():
        return
    db.add(DMMessageReaction(message_id=msg_id, user_id=current_user.id, emoji=body.emoji))
    await db.flush()

    parts = await db.execute(select(DMParticipant.user_id).where(DMParticipant.dm_id == dm_id))
    part_ids = [str(r[0]) for r in parts.all()]
    await manager.broadcast_to_users(part_ids, {
        "event": "dm_reaction_add",
        "data": {
            "dm_id": str(dm_id),
            "message_id": str(msg_id),
            "user_id": str(current_user.id),
            "emoji": body.emoji,
        },
    }, exclude_user=str(current_user.id))


@router.delete("/{dm_id}/messages/{msg_id}/reactions", status_code=204)
async def remove_dm_reaction(
    dm_id: uuid.UUID,
    msg_id: uuid.UUID,
    emoji: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await _require_dm_participant(dm_id, current_user.id, db)
    result = await db.execute(
        select(DMMessageReaction).where(
            DMMessageReaction.message_id == msg_id,
            DMMessageReaction.user_id == current_user.id,
            DMMessageReaction.emoji == emoji,
        )
    )
    reaction = result.scalar_one_or_none()
    if not reaction:
        return
    await db.delete(reaction)
    await db.flush()

    parts = await db.execute(select(DMParticipant.user_id).where(DMParticipant.dm_id == dm_id))
    part_ids = [str(r[0]) for r in parts.all()]
    await manager.broadcast_to_users(part_ids, {
        "event": "dm_reaction_remove",
        "data": {
            "dm_id": str(dm_id),
            "message_id": str(msg_id),
            "user_id": str(current_user.id),
            "emoji": emoji,
        },
    }, exclude_user=str(current_user.id))
