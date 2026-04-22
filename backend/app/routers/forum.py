"""Forum channel posts and tags.

Every forum channel is a Channel row with type='forum'. Posts and tags
belong to the channel. A single "rules" post (is_rules=TRUE) is always
pinned at the top of the list and admins set it via
`PATCH /api/channels/{id}/forum/rules`.
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, desc, asc, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import (
    get_db, get_current_active_user, require_permission, compute_permissions,
)
from app.core.search import escape_like
from app.models.channel import Channel
from app.models.forum import ForumPost, ForumTag, ForumReply
from app.models.role import Permissions
from app.models.server import ServerMember
from app.models.user import User
from app.schemas.user import UserPublic
from app.services.websocket_service import manager

router = APIRouter(prefix="/api/channels/{channel_id}/forum", tags=["forum"])
replies_router = APIRouter(prefix="/api/forum-posts/{post_id}/replies", tags=["forum"])


# ─── Schemas ────────────────────────────────────────────────────────────

class TagOut(BaseModel):
    model_config = {"from_attributes": True}
    id: uuid.UUID
    channel_id: uuid.UUID
    name: str
    color: str
    emoji: str | None = None
    position: int = 0


class TagCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=32)
    color: str = Field("#7c5cff", pattern=r"^#[0-9a-fA-F]{6}$")
    emoji: str | None = Field(None, max_length=8)


class TagUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=32)
    color: str | None = Field(None, pattern=r"^#[0-9a-fA-F]{6}$")
    emoji: str | None = Field(None, max_length=8)
    position: int | None = Field(None, ge=0)


class PostCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    content: str = Field("", max_length=10000)
    tag_ids: list[uuid.UUID] = Field(default_factory=list, max_length=5)


class PostUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=120)
    content: str | None = Field(None, max_length=10000)
    tag_ids: list[uuid.UUID] | None = Field(None, max_length=5)
    is_locked: bool | None = None
    is_pinned: bool | None = None


class PostOut(BaseModel):
    model_config = {"from_attributes": True}
    id: uuid.UUID
    channel_id: uuid.UUID
    author: UserPublic | None = None
    title: str
    content: str
    tag_ids: list[uuid.UUID] = []
    is_rules: bool = False
    is_locked: bool = False
    is_pinned: bool = False
    reply_count: int = 0
    last_activity_at: datetime
    created_at: datetime


class ForumListOut(BaseModel):
    posts: list[PostOut]
    rules: PostOut | None = None
    tags: list[TagOut] = []
    has_more: bool = False


class RulesUpdate(BaseModel):
    title: str = Field("Правила форума", min_length=1, max_length=120)
    content: str = Field("", max_length=10000)


# ─── Helpers ────────────────────────────────────────────────────────────

async def _get_forum(db: AsyncSession, channel_id: uuid.UUID) -> Channel:
    r = await db.execute(select(Channel).where(Channel.id == channel_id))
    ch = r.scalar_one_or_none()
    if not ch:
        raise HTTPException(status_code=404, detail="Канал не найден")
    if ch.type != "forum":
        raise HTTPException(status_code=400, detail="Это не форум")
    return ch


async def _require_member(db: AsyncSession, server_id: uuid.UUID, user: User) -> None:
    r = await db.execute(
        select(ServerMember).where(
            ServerMember.server_id == server_id,
            ServerMember.user_id == user.id,
        )
    )
    if not r.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member")


async def _require_channel_perm(
    db: AsyncSession, ch: Channel, user: User, perm: int,
) -> int:
    perms = await compute_permissions(ch.server_id, user.id, db, channel_id=ch.id)
    if not ((perms & perm) == perm or (perms & Permissions.ADMIN)):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    return perms


# ─── Tags ────────────────────────────────────────────────────────────────

@router.get("/tags", response_model=list[TagOut])
async def list_tags(
    channel_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    ch = await _get_forum(db, channel_id)
    await _require_member(db, ch.server_id, current_user)
    r = await db.execute(
        select(ForumTag)
        .where(ForumTag.channel_id == channel_id)
        .order_by(ForumTag.position.asc(), ForumTag.created_at.asc())
    )
    return list(r.scalars())


@router.post("/tags", response_model=TagOut, status_code=201)
async def create_tag(
    channel_id: uuid.UUID,
    body: TagCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    ch = await _get_forum(db, channel_id)
    await _require_channel_perm(db, ch, current_user, Permissions.MANAGE_CHANNELS)
    tag = ForumTag(
        channel_id=channel_id,
        name=body.name.strip()[:32],
        color=body.color,
        emoji=body.emoji,
    )
    db.add(tag)
    await db.flush()
    await db.refresh(tag)
    return tag


@router.patch("/tags/{tag_id}", response_model=TagOut)
async def update_tag(
    channel_id: uuid.UUID,
    tag_id: uuid.UUID,
    body: TagUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    ch = await _get_forum(db, channel_id)
    await _require_channel_perm(db, ch, current_user, Permissions.MANAGE_CHANNELS)
    r = await db.execute(
        select(ForumTag).where(ForumTag.id == tag_id, ForumTag.channel_id == channel_id)
    )
    tag = r.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Тэг не найден")
    if body.name is not None: tag.name = body.name.strip()[:32]
    if body.color is not None: tag.color = body.color
    if body.emoji is not None: tag.emoji = body.emoji or None
    if body.position is not None: tag.position = body.position
    await db.flush()
    return tag


@router.delete("/tags/{tag_id}", status_code=204)
async def delete_tag(
    channel_id: uuid.UUID,
    tag_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    ch = await _get_forum(db, channel_id)
    await _require_channel_perm(db, ch, current_user, Permissions.MANAGE_CHANNELS)
    r = await db.execute(
        select(ForumTag).where(ForumTag.id == tag_id, ForumTag.channel_id == channel_id)
    )
    tag = r.scalar_one_or_none()
    if not tag:
        return
    await db.delete(tag)


# ─── Posts ──────────────────────────────────────────────────────────────

def _post_to_out(p: ForumPost) -> PostOut:
    out = PostOut.model_validate(p)
    if p.author:
        out.author = UserPublic.model_validate(p.author)
    out.tag_ids = [uuid.UUID(str(x)) for x in (p.tag_ids or [])]
    return out


@router.get("/posts", response_model=ForumListOut)
async def list_posts(
    channel_id: uuid.UUID,
    q: str | None = Query(None, max_length=200),
    sort: str = Query("recent", pattern=r"^(recent|new|oldest)$"),
    tag: uuid.UUID | None = None,
    limit: int = Query(30, ge=1, le=100),
    cursor: datetime | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    ch = await _get_forum(db, channel_id)
    await _require_member(db, ch.server_id, current_user)
    await _require_channel_perm(db, ch, current_user, Permissions.READ_MESSAGES)

    # Rules post (always first regardless of sort/search).
    rr = await db.execute(
        select(ForumPost)
        .options(selectinload(ForumPost.author))
        .where(ForumPost.channel_id == channel_id, ForumPost.is_rules == True)
        .limit(1)
    )
    rules_post = rr.scalar_one_or_none()

    stmt = (
        select(ForumPost)
        .options(selectinload(ForumPost.author))
        .where(ForumPost.channel_id == channel_id, ForumPost.is_rules == False)
    )
    if q:
        pat = f"%{escape_like(q.strip())}%"
        stmt = stmt.where(or_(
            ForumPost.title.ilike(pat, escape="\\"),
            ForumPost.content.ilike(pat, escape="\\"),
        ))
    if tag:
        # tag_ids stored as JSONB array of stringified UUIDs.
        stmt = stmt.where(ForumPost.tag_ids.op("?")(str(tag)))

    # Pinned posts always on top of the user-sorted list.
    if sort == "oldest":
        stmt = stmt.order_by(desc(ForumPost.is_pinned), asc(ForumPost.created_at))
        if cursor:
            stmt = stmt.where(ForumPost.created_at > cursor)
    elif sort == "new":
        stmt = stmt.order_by(desc(ForumPost.is_pinned), desc(ForumPost.created_at))
        if cursor:
            stmt = stmt.where(ForumPost.created_at < cursor)
    else:  # recent = by last_activity
        stmt = stmt.order_by(desc(ForumPost.is_pinned), desc(ForumPost.last_activity_at))
        if cursor:
            stmt = stmt.where(ForumPost.last_activity_at < cursor)

    stmt = stmt.limit(limit + 1)
    rs = await db.execute(stmt)
    posts = list(rs.scalars())
    has_more = len(posts) > limit
    if has_more:
        posts = posts[:limit]

    tag_res = await db.execute(
        select(ForumTag)
        .where(ForumTag.channel_id == channel_id)
        .order_by(ForumTag.position.asc(), ForumTag.created_at.asc())
    )

    return ForumListOut(
        posts=[_post_to_out(p) for p in posts],
        rules=_post_to_out(rules_post) if rules_post else None,
        tags=list(tag_res.scalars()),
        has_more=has_more,
    )


@router.post("/posts", response_model=PostOut, status_code=201)
async def create_post(
    channel_id: uuid.UUID,
    body: PostCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    ch = await _get_forum(db, channel_id)
    await _require_member(db, ch.server_id, current_user)
    await _require_channel_perm(db, ch, current_user, Permissions.SEND_MESSAGES)

    # Validate tag_ids belong to this channel.
    if body.tag_ids:
        tr = await db.execute(
            select(ForumTag.id).where(
                ForumTag.channel_id == channel_id,
                ForumTag.id.in_(body.tag_ids),
            )
        )
        valid = {row[0] for row in tr.all()}
        tag_ids = [t for t in body.tag_ids if t in valid]
    else:
        tag_ids = []

    now = datetime.now(timezone.utc)
    post = ForumPost(
        channel_id=channel_id,
        author_id=current_user.id,
        title=body.title.strip()[:120],
        content=body.content or "",
        tag_ids=[str(t) for t in tag_ids],
        last_activity_at=now,
    )
    db.add(post)
    await db.flush()
    await db.refresh(post)
    # Ensure relationship for serialisation
    ar = await db.execute(
        select(ForumPost)
        .options(selectinload(ForumPost.author))
        .where(ForumPost.id == post.id)
    )
    post = ar.scalar_one()
    out = _post_to_out(post)

    await manager.broadcast_to_server(str(ch.server_id), {
        "event": "forum_post_create",
        "data": out.model_dump(mode="json"),
    })
    return out


@router.patch("/posts/{post_id}", response_model=PostOut)
async def update_post(
    channel_id: uuid.UUID,
    post_id: uuid.UUID,
    body: PostUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    ch = await _get_forum(db, channel_id)
    r = await db.execute(
        select(ForumPost)
        .options(selectinload(ForumPost.author))
        .where(ForumPost.id == post_id, ForumPost.channel_id == channel_id)
    )
    post = r.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")

    perms = await compute_permissions(ch.server_id, current_user.id, db, channel_id=ch.id)
    is_author = post.author_id == current_user.id
    can_manage = bool(perms & Permissions.MANAGE_MESSAGES) or bool(perms & Permissions.ADMIN)

    if body.title is not None or body.content is not None or body.tag_ids is not None:
        if not (is_author or can_manage):
            raise HTTPException(status_code=403, detail="Нельзя редактировать чужой пост")

    # Pin/lock are admin-only.
    if (body.is_pinned is not None or body.is_locked is not None) and not can_manage:
        raise HTTPException(status_code=403, detail="Недостаточно прав для закрепа/блокировки")

    if body.title is not None:
        post.title = body.title.strip()[:120]
    if body.content is not None:
        post.content = body.content
    if body.tag_ids is not None:
        tr = await db.execute(
            select(ForumTag.id).where(
                ForumTag.channel_id == channel_id,
                ForumTag.id.in_(body.tag_ids),
            )
        )
        valid = {row[0] for row in tr.all()}
        post.tag_ids = [str(t) for t in body.tag_ids if t in valid]
    if body.is_pinned is not None:
        post.is_pinned = body.is_pinned
    if body.is_locked is not None:
        post.is_locked = body.is_locked

    await db.flush()
    return _post_to_out(post)


@router.delete("/posts/{post_id}", status_code=204)
async def delete_post(
    channel_id: uuid.UUID,
    post_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    ch = await _get_forum(db, channel_id)
    r = await db.execute(
        select(ForumPost).where(ForumPost.id == post_id, ForumPost.channel_id == channel_id)
    )
    post = r.scalar_one_or_none()
    if not post:
        return
    perms = await compute_permissions(ch.server_id, current_user.id, db, channel_id=ch.id)
    is_author = post.author_id == current_user.id
    can_manage = bool(perms & Permissions.MANAGE_MESSAGES) or bool(perms & Permissions.ADMIN)
    if not (is_author or can_manage):
        raise HTTPException(status_code=403, detail="Нельзя удалить чужой пост")
    if post.is_rules and not can_manage:
        raise HTTPException(status_code=403, detail="Пост-правила может удалить только админ")
    await db.delete(post)


# ─── Rules (special pinned admin post) ─────────────────────────────────

@router.put("/rules", response_model=PostOut)
async def upsert_rules(
    channel_id: uuid.UUID,
    body: RulesUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    ch = await _get_forum(db, channel_id)
    await _require_channel_perm(db, ch, current_user, Permissions.MANAGE_CHANNELS)
    r = await db.execute(
        select(ForumPost)
        .options(selectinload(ForumPost.author))
        .where(ForumPost.channel_id == channel_id, ForumPost.is_rules == True)
    )
    rules = r.scalar_one_or_none()
    if rules:
        rules.title = body.title.strip()[:120]
        rules.content = body.content
    else:
        now = datetime.now(timezone.utc)
        rules = ForumPost(
            channel_id=channel_id,
            author_id=current_user.id,
            title=body.title.strip()[:120],
            content=body.content,
            is_rules=True,
            is_pinned=True,
            last_activity_at=now,
        )
        db.add(rules)
        await db.flush()
        await db.refresh(rules)
        ar = await db.execute(
            select(ForumPost)
            .options(selectinload(ForumPost.author))
            .where(ForumPost.id == rules.id)
        )
        rules = ar.scalar_one()
    await db.flush()
    return _post_to_out(rules)


@router.delete("/rules", status_code=204)
async def delete_rules(
    channel_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    ch = await _get_forum(db, channel_id)
    await _require_channel_perm(db, ch, current_user, Permissions.MANAGE_CHANNELS)
    r = await db.execute(
        select(ForumPost).where(ForumPost.channel_id == channel_id, ForumPost.is_rules == True)
    )
    rules = r.scalar_one_or_none()
    if rules:
        await db.delete(rules)


# ─── Replies (thread messages inside a forum post) ─────────────────────


class ReplyOut(BaseModel):
    model_config = {"from_attributes": True}
    id: uuid.UUID
    post_id: uuid.UUID
    author: UserPublic | None = None
    content: str
    edited_at: datetime | None = None
    is_deleted: bool = False
    created_at: datetime


class ReplyCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)


class ReplyUpdate(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)


async def _get_post_with_channel(
    db: AsyncSession, post_id: uuid.UUID,
) -> tuple[ForumPost, Channel]:
    pr = await db.execute(select(ForumPost).where(ForumPost.id == post_id))
    post = pr.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")
    cr = await db.execute(select(Channel).where(Channel.id == post.channel_id))
    ch = cr.scalar_one_or_none()
    if not ch:
        raise HTTPException(status_code=404, detail="Канал не найден")
    return post, ch


def _reply_to_out(r: ForumReply) -> ReplyOut:
    out = ReplyOut.model_validate(r)
    if r.author:
        out.author = UserPublic.model_validate(r.author)
    return out


@replies_router.get("", response_model=list[ReplyOut])
@replies_router.get("/", response_model=list[ReplyOut], include_in_schema=False)
async def list_replies(
    post_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    post, ch = await _get_post_with_channel(db, post_id)
    await _require_member(db, ch.server_id, current_user)
    await _require_channel_perm(db, ch, current_user, Permissions.READ_MESSAGES)
    rs = await db.execute(
        select(ForumReply)
        .options(selectinload(ForumReply.author))
        .where(ForumReply.post_id == post_id)
        .order_by(ForumReply.created_at.asc())
    )
    return [_reply_to_out(r) for r in rs.scalars()]


@replies_router.post("", response_model=ReplyOut, status_code=201)
@replies_router.post("/", response_model=ReplyOut, status_code=201, include_in_schema=False)
async def create_reply(
    post_id: uuid.UUID,
    body: ReplyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    post, ch = await _get_post_with_channel(db, post_id)
    await _require_member(db, ch.server_id, current_user)
    await _require_channel_perm(db, ch, current_user, Permissions.SEND_MESSAGES)
    if post.is_locked:
        perms = await compute_permissions(ch.server_id, current_user.id, db, channel_id=ch.id)
        if not ((perms & Permissions.MANAGE_MESSAGES) or (perms & Permissions.ADMIN)):
            raise HTTPException(status_code=403, detail="Публикация закрыта для ответов")

    reply = ForumReply(
        post_id=post_id, author_id=current_user.id,
        content=body.content.strip()[:4000],
    )
    db.add(reply)
    # Bump thread liveness — used by the "recent" sort on the forum list.
    post.reply_count = (post.reply_count or 0) + 1
    post.last_activity_at = datetime.now(timezone.utc)
    await db.flush()
    ar = await db.execute(
        select(ForumReply)
        .options(selectinload(ForumReply.author))
        .where(ForumReply.id == reply.id)
    )
    reply = ar.scalar_one()
    out = _reply_to_out(reply)

    # Fan-out so other viewers see the new reply in real time.
    await manager.broadcast_to_server(str(ch.server_id), {
        "event": "forum_reply_create",
        "data": {**out.model_dump(mode="json"), "channel_id": str(ch.id)},
    })
    return out


@replies_router.patch("/{reply_id}", response_model=ReplyOut)
async def update_reply(
    post_id: uuid.UUID,
    reply_id: uuid.UUID,
    body: ReplyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    post, ch = await _get_post_with_channel(db, post_id)
    r = await db.execute(
        select(ForumReply)
        .options(selectinload(ForumReply.author))
        .where(ForumReply.id == reply_id, ForumReply.post_id == post_id)
    )
    reply = r.scalar_one_or_none()
    if not reply:
        raise HTTPException(status_code=404, detail="Ответ не найден")
    if reply.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Нельзя редактировать чужой ответ")
    reply.content = body.content.strip()[:4000]
    reply.edited_at = datetime.now(timezone.utc)
    await db.flush()
    return _reply_to_out(reply)


@replies_router.delete("/{reply_id}", status_code=204)
async def delete_reply(
    post_id: uuid.UUID,
    reply_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    post, ch = await _get_post_with_channel(db, post_id)
    r = await db.execute(
        select(ForumReply).where(ForumReply.id == reply_id, ForumReply.post_id == post_id)
    )
    reply = r.scalar_one_or_none()
    if not reply:
        return
    perms = await compute_permissions(ch.server_id, current_user.id, db, channel_id=ch.id)
    is_author = reply.author_id == current_user.id
    can_manage = bool(perms & Permissions.MANAGE_MESSAGES) or bool(perms & Permissions.ADMIN)
    if not (is_author or can_manage):
        raise HTTPException(status_code=403, detail="Нельзя удалить чужой ответ")
    await db.delete(reply)
    post.reply_count = max(0, (post.reply_count or 1) - 1)
