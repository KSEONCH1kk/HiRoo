import uuid
import aiofiles
from pathlib import Path
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload

from pydantic import BaseModel, Field
from app.core.config import settings as app_settings
from app.core.deps import get_db, get_current_active_user
from app.models.user import User
from app.models.dm import DirectMessage, DMParticipant, DMMessage, DMMessageReaction
from app.schemas.dm import DMCreate, DMResponse
from app.schemas.message import DMMessageCreate, DMMessageResponse, PaginatedDMMessages, ReactionResponse, ReplyPreview
from app.schemas.user import UserPublic
from app.services.websocket_service import manager


ALLOWED_ICON_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
MAX_ICON_BYTES = 5 * 1024 * 1024


def _build_dm_response(msg: DMMessage, current_user_id: uuid.UUID) -> DMMessageResponse:
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
    return DMMessageResponse(
        id=msg.id,
        dm_id=msg.dm_id,
        author_id=msg.author_id,
        type=getattr(msg, "type", "text") or "text",
        content=msg.content,
        reply_to_id=getattr(msg, "reply_to_id", None),
        reply_to=reply_to,
        edited_at=msg.edited_at,
        is_deleted=msg.is_deleted,
        is_pinned=getattr(msg, "is_pinned", False),
        pinned_at=getattr(msg, "pinned_at", None),
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

    # Can't open a DM with someone who's on your block list, or with someone
    # who's blocked you. Also honour the recipient's "only friends can DM" setting.
    from app.services.blocks import either_blocks
    from app.services.privacy import can_dm
    for uid in all_ids:
        if uid == current_user.id:
            continue
        if await either_blocks(current_user.id, uid, db):
            raise HTTPException(status_code=403, detail="Пользователь заблокирован или заблокировал вас")
        target_res = await db.execute(select(User).where(User.id == uid))
        target = target_res.scalar_one_or_none()
        if target and not await can_dm(current_user, target, db):
            raise HTTPException(status_code=403, detail=f"{target.username} принимает ЛС только от друзей")

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

    dm = DirectMessage(
        is_group=is_group,
        name=body.name if is_group else None,
        owner_id=current_user.id if is_group else None,
    )
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
        .options(
            selectinload(DMMessage.author),
            selectinload(DMMessage.reactions),
            selectinload(DMMessage.reply_to).selectinload(DMMessage.author),
        )
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


class DMMessageSearchResponse(BaseModel):
    items: list[DMMessageResponse]


@router.get("/{dm_id}/messages/search", response_model=DMMessageSearchResponse)
async def search_dm_messages(
    dm_id: uuid.UUID,
    q: str = Query("", max_length=200),
    author_id: uuid.UUID | None = Query(None),
    before: datetime | None = Query(None),
    after: datetime | None = Query(None),
    has: str | None = Query(None, pattern="^(link|file|image)$"),
    limit: int = Query(30, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await _require_dm_participant(dm_id, current_user.id, db)
    stmt = (
        select(DMMessage)
        .options(
            selectinload(DMMessage.author),
            selectinload(DMMessage.reactions),
            selectinload(DMMessage.reply_to).selectinload(DMMessage.author),
        )
        .where(DMMessage.dm_id == dm_id, DMMessage.is_deleted == False, DMMessage.type == "text")
    )
    q_clean = q.strip()
    if q_clean:
        from app.core.search import escape_like
        stmt = stmt.where(DMMessage.content.ilike(f"%{escape_like(q_clean)}%", escape="\\"))
    if author_id:
        stmt = stmt.where(DMMessage.author_id == author_id)
    if after:
        stmt = stmt.where(DMMessage.created_at > after)
    if before:
        stmt = stmt.where(DMMessage.created_at < before)
    if has == "link":
        stmt = stmt.where(or_(
            DMMessage.content.ilike("%http://%"),
            DMMessage.content.ilike("%https://%"),
        ))
    elif has == "file":
        stmt = stmt.where(DMMessage.content.ilike("%/uploads/%"))
    elif has == "image":
        stmt = stmt.where(or_(
            DMMessage.content.ilike("%.png%"),
            DMMessage.content.ilike("%.jpg%"),
            DMMessage.content.ilike("%.jpeg%"),
            DMMessage.content.ilike("%.gif%"),
            DMMessage.content.ilike("%.webp%"),
        ))
    stmt = stmt.order_by(DMMessage.created_at.desc()).limit(limit)
    res = await db.execute(stmt)
    rows = res.scalars().all()
    return DMMessageSearchResponse(items=[_build_dm_response(m, current_user.id) for m in rows])


@router.post("/{dm_id}/messages", response_model=DMMessageResponse, status_code=201)
async def send_dm_message(
    dm_id: uuid.UUID,
    body: DMMessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await _require_dm_participant(dm_id, current_user.id, db)

    # Block enforcement for 1:1 DMs only — in group DMs we let everyone
    # keep typing; the client hides blocked users' messages visually.
    dm_info_res = await db.execute(select(DirectMessage).where(DirectMessage.id == dm_id))
    _dm_info = dm_info_res.scalar_one_or_none()
    if _dm_info and not _dm_info.is_group:
        from app.services.blocks import either_blocks
        others_res = await db.execute(
            select(DMParticipant.user_id).where(
                DMParticipant.dm_id == dm_id,
                DMParticipant.user_id != current_user.id,
            )
        )
        for (other_id,) in others_res.all():
            if await either_blocks(current_user.id, other_id, db):
                raise HTTPException(
                    status_code=403,
                    detail="Нельзя отправить сообщение: блокировка активна",
                )

    reply_to_id = body.reply_to_id
    if reply_to_id:
        ref_res = await db.execute(
            select(DMMessage).where(DMMessage.id == reply_to_id, DMMessage.dm_id == dm_id)
        )
        if not ref_res.scalar_one_or_none():
            reply_to_id = None
    msg = DMMessage(
        dm_id=dm_id, author_id=current_user.id, content=body.content,
        reply_to_id=reply_to_id,
    )
    db.add(msg)

    dm_result = await db.execute(select(DirectMessage).where(DirectMessage.id == dm_id))
    dm = dm_result.scalar_one()
    dm.updated_at = datetime.now(timezone.utc)

    await db.flush()

    loaded = await db.execute(
        select(DMMessage)
        .options(
            selectinload(DMMessage.author),
            selectinload(DMMessage.reactions),
            selectinload(DMMessage.reply_to).selectinload(DMMessage.author),
        )
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
        .options(
            selectinload(DMMessage.author),
            selectinload(DMMessage.reactions),
            selectinload(DMMessage.reply_to).selectinload(DMMessage.author),
        )
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


# ── Group admin ──────────────────────────────────────────────

class DMUpdate(BaseModel):
    name: str | None = Field(None, max_length=100)


async def _require_group_owner(dm_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> DirectMessage:
    res = await db.execute(select(DirectMessage).where(DirectMessage.id == dm_id))
    dm = res.scalar_one_or_none()
    if not dm:
        raise HTTPException(status_code=404, detail="Диалог не найден")
    if not dm.is_group:
        raise HTTPException(status_code=400, detail="Только для групповых диалогов")
    if dm.owner_id != user_id:
        raise HTTPException(status_code=403, detail="Только владелец группы")
    return dm


async def _broadcast_dm_update(db: AsyncSession, dm_id: uuid.UUID) -> DirectMessage:
    loaded = await db.execute(_dm_with_participants().where(DirectMessage.id == dm_id))
    dm = loaded.scalars().unique().one()
    payload = DMResponse.model_validate(dm, from_attributes=True).model_dump(mode="json")
    parts = await db.execute(select(DMParticipant.user_id).where(DMParticipant.dm_id == dm_id))
    part_ids = [str(r[0]) for r in parts.all()]
    await manager.broadcast_to_users(part_ids, {"event": "dm_update", "data": payload})
    return dm


@router.patch("/{dm_id}", response_model=DMResponse)
async def update_dm(
    dm_id: uuid.UUID,
    body: DMUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await _require_group_owner(dm_id, current_user.id, db)
    res = await db.execute(select(DirectMessage).where(DirectMessage.id == dm_id))
    dm = res.scalar_one()
    if body.name is not None:
        dm.name = body.name.strip() or None
    dm.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return await _broadcast_dm_update(db, dm_id)


@router.post("/{dm_id}/icon", response_model=DMResponse)
async def upload_dm_icon(
    dm_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await _require_group_owner(dm_id, current_user.id, db)
    if file.content_type not in ALLOWED_ICON_TYPES:
        raise HTTPException(status_code=415, detail="Поддерживаются только изображения")
    content = await file.read()
    if len(content) > MAX_ICON_BYTES:
        raise HTTPException(status_code=413, detail="Файл больше 5 МБ")
    if not content:
        raise HTTPException(status_code=400, detail="Пустой файл")

    res = await db.execute(select(DirectMessage).where(DirectMessage.id == dm_id))
    dm = res.scalar_one()

    upload_dir = Path(app_settings.UPLOAD_DIR) / "dm-icons"
    upload_dir.mkdir(parents=True, exist_ok=True)
    ext = "jpg"
    if file.filename and "." in file.filename:
        ext = file.filename.rsplit(".", 1)[-1].lower()
    filename = f"{dm_id}.{ext}"
    dest = upload_dir / filename
    async with aiofiles.open(dest, "wb") as f:
        await f.write(content)

    dm.icon_url = f"/uploads/dm-icons/{filename}"
    dm.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return await _broadcast_dm_update(db, dm_id)


@router.delete("/{dm_id}/icon", response_model=DMResponse)
async def delete_dm_icon(
    dm_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await _require_group_owner(dm_id, current_user.id, db)
    res = await db.execute(select(DirectMessage).where(DirectMessage.id == dm_id))
    dm = res.scalar_one()
    dm.icon_url = None
    dm.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return await _broadcast_dm_update(db, dm_id)


@router.delete("/{dm_id}/members/{target_user_id}", status_code=204)
async def kick_dm_member(
    dm_id: uuid.UUID,
    target_user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    # Self-leave is allowed for any group member; kicking others requires owner
    res = await db.execute(select(DirectMessage).where(DirectMessage.id == dm_id))
    dm = res.scalar_one_or_none()
    if not dm:
        raise HTTPException(status_code=404, detail="Диалог не найден")
    if not dm.is_group:
        raise HTTPException(status_code=400, detail="Только для групповых диалогов")
    is_self = target_user_id == current_user.id
    if not is_self and dm.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только владелец может исключать")
    if target_user_id == dm.owner_id and not is_self:
        raise HTTPException(status_code=400, detail="Нельзя исключить владельца")

    part_res = await db.execute(
        select(DMParticipant).where(
            DMParticipant.dm_id == dm_id,
            DMParticipant.user_id == target_user_id,
        )
    )
    part = part_res.scalar_one_or_none()
    if not part:
        raise HTTPException(status_code=404, detail="Участник не найден")
    await db.delete(part)

    # If owner leaves, pass ownership to the earliest remaining member
    if is_self and target_user_id == dm.owner_id:
        next_res = await db.execute(
            select(DMParticipant)
            .where(DMParticipant.dm_id == dm_id, DMParticipant.user_id != target_user_id)
            .order_by(DMParticipant.joined_at.asc())
            .limit(1)
        )
        successor = next_res.scalar_one_or_none()
        dm.owner_id = successor.user_id if successor else None

    dm.updated_at = datetime.now(timezone.utc)
    await db.flush()

    # Notify remaining + the kicked user
    parts = await db.execute(select(DMParticipant.user_id).where(DMParticipant.dm_id == dm_id))
    remaining_ids = [str(r[0]) for r in parts.all()]
    recipients = list({*remaining_ids, str(target_user_id)})
    await manager.broadcast_to_users(recipients, {
        "event": "dm_member_left",
        "data": {"dm_id": str(dm_id), "user_id": str(target_user_id), "kicked": not is_self},
    })
    if remaining_ids:
        loaded = await db.execute(_dm_with_participants().where(DirectMessage.id == dm_id))
        dm_full = loaded.scalars().unique().one()
        payload = DMResponse.model_validate(dm_full, from_attributes=True).model_dump(mode="json")
        await manager.broadcast_to_users(remaining_ids, {"event": "dm_update", "data": payload})


# ── Pinned messages ─────────────────────────────────────────────

@router.put("/{dm_id}/messages/{msg_id}/pin", response_model=DMMessageResponse)
async def pin_dm_message(
    dm_id: uuid.UUID,
    msg_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await _require_dm_participant(dm_id, current_user.id, db)
    result = await db.execute(
        select(DMMessage)
        .options(
            selectinload(DMMessage.author),
            selectinload(DMMessage.reactions),
            selectinload(DMMessage.reply_to).selectinload(DMMessage.author),
        )
        .where(DMMessage.id == msg_id, DMMessage.dm_id == dm_id)
    )
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Сообщение не найдено")
    if msg.is_deleted:
        raise HTTPException(status_code=400, detail="Нельзя закрепить удалённое сообщение")
    msg.is_pinned = True
    msg.pinned_at = datetime.now(timezone.utc)
    await db.flush()
    parts = await db.execute(select(DMParticipant.user_id).where(DMParticipant.dm_id == dm_id))
    part_ids = [str(r[0]) for r in parts.all()]
    await manager.broadcast_to_users(part_ids, {
        "event": "dm_message_pin",
        "data": {"dm_id": str(dm_id), "message_id": str(msg_id), "is_pinned": True},
    })
    return _build_dm_response(msg, current_user.id)


@router.delete("/{dm_id}/messages/{msg_id}/pin", response_model=DMMessageResponse)
async def unpin_dm_message(
    dm_id: uuid.UUID,
    msg_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await _require_dm_participant(dm_id, current_user.id, db)
    result = await db.execute(
        select(DMMessage)
        .options(
            selectinload(DMMessage.author),
            selectinload(DMMessage.reactions),
            selectinload(DMMessage.reply_to).selectinload(DMMessage.author),
        )
        .where(DMMessage.id == msg_id, DMMessage.dm_id == dm_id)
    )
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Сообщение не найдено")
    msg.is_pinned = False
    msg.pinned_at = None
    await db.flush()
    parts = await db.execute(select(DMParticipant.user_id).where(DMParticipant.dm_id == dm_id))
    part_ids = [str(r[0]) for r in parts.all()]
    await manager.broadcast_to_users(part_ids, {
        "event": "dm_message_pin",
        "data": {"dm_id": str(dm_id), "message_id": str(msg_id), "is_pinned": False},
    })
    return _build_dm_response(msg, current_user.id)


@router.get("/{dm_id}/pinned", response_model=list[DMMessageResponse])
async def list_dm_pinned(
    dm_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await _require_dm_participant(dm_id, current_user.id, db)
    result = await db.execute(
        select(DMMessage)
        .options(
            selectinload(DMMessage.author),
            selectinload(DMMessage.reactions),
            selectinload(DMMessage.reply_to).selectinload(DMMessage.author),
        )
        .where(DMMessage.dm_id == dm_id, DMMessage.is_pinned == True, DMMessage.is_deleted == False)
        .order_by(DMMessage.pinned_at.desc())
        .limit(50)
    )
    msgs = result.scalars().all()
    return [_build_dm_response(m, current_user.id) for m in msgs]
