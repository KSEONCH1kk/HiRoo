import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_, func
from sqlalchemy.orm import selectinload

from app.core.deps import get_db, get_current_active_user
from app.models.user import User
from app.models.friend import FriendRequest
from app.schemas.friend import FriendRequestCreate, FriendRequestResponse, FriendResponse
from app.services.websocket_service import manager
from app.services.notification_service import create_notification

router = APIRouter(prefix="/api/friends", tags=["friends"])


@router.get("/", response_model=list[FriendResponse])
async def list_friends(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(
        select(FriendRequest).where(
            or_(
                FriendRequest.from_user_id == current_user.id,
                FriendRequest.to_user_id == current_user.id,
            ),
            FriendRequest.status == "accepted",
        )
    )
    requests = result.scalars().all()
    friends = []
    for req in requests:
        other_id = req.to_user_id if req.from_user_id == current_user.id else req.from_user_id
        user_result = await db.execute(select(User).where(User.id == other_id))
        u = user_result.scalar_one_or_none()
        if u:
            friends.append(u)
    return friends


@router.get("/pending", response_model=list[FriendRequestResponse])
async def pending_requests(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(
        select(FriendRequest)
        .options(selectinload(FriendRequest.from_user), selectinload(FriendRequest.to_user))
        .where(
            FriendRequest.to_user_id == current_user.id,
            FriendRequest.status == "pending",
        )
    )
    return result.scalars().all()


@router.post("/request", response_model=FriendRequestResponse, status_code=201)
async def send_friend_request(
    body: FriendRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    raw = (body.username or "").strip().lstrip("@")
    if not raw:
        raise HTTPException(status_code=400, detail="Укажите имя пользователя")
    key = raw.lower()
    result = await db.execute(
        select(User).where(
            or_(
                func.lower(User.username) == key,
                func.lower(User.display_name) == key,
            )
        ).order_by(
            # Prefer exact username match over display_name match
            (func.lower(User.username) == key).desc()
        ).limit(1)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя отправить заявку самому себе")
    from app.services.blocks import either_blocks
    if await either_blocks(current_user.id, target.id, db):
        raise HTTPException(status_code=403, detail="Пользователь недоступен")

    existing = await db.execute(
        select(FriendRequest).where(
            or_(
                and_(FriendRequest.from_user_id == current_user.id, FriendRequest.to_user_id == target.id),
                and_(FriendRequest.from_user_id == target.id, FriendRequest.to_user_id == current_user.id),
            )
        )
    )
    existing_req = existing.scalar_one_or_none()
    if existing_req:
        if existing_req.status == "accepted":
            raise HTTPException(status_code=409, detail="Вы уже друзья")
        if existing_req.status == "pending":
            if existing_req.from_user_id == current_user.id:
                raise HTTPException(status_code=409, detail="Заявка уже отправлена")
            raise HTTPException(status_code=409, detail="Этот пользователь уже отправил вам заявку — примите её во вкладке «Заявки»")
        if existing_req.status == "blocked":
            raise HTTPException(status_code=403, detail="Невозможно отправить заявку")
        if existing_req.status == "rejected":
            # allow re-sending after rejection
            existing_req.status = "pending"
            existing_req.from_user_id = current_user.id
            existing_req.to_user_id = target.id
            await db.flush()
            result = await db.execute(
                select(FriendRequest)
                .options(selectinload(FriendRequest.from_user), selectinload(FriendRequest.to_user))
                .where(FriendRequest.id == existing_req.id)
            )
            req = result.scalar_one()
            await create_notification(db, target.id, "friend_request", from_user_id=current_user.id)
            await manager.send_to_user(str(target.id), {
                "event": "friend_request",
                "data": {"from_user_id": str(current_user.id), "username": current_user.username},
            })
            return req

    req = FriendRequest(from_user_id=current_user.id, to_user_id=target.id, status="pending")
    db.add(req)
    await db.flush()

    result = await db.execute(
        select(FriendRequest)
        .options(selectinload(FriendRequest.from_user), selectinload(FriendRequest.to_user))
        .where(FriendRequest.id == req.id)
    )
    req = result.scalar_one()

    await create_notification(db, target.id, "friend_request", from_user_id=current_user.id)
    await manager.send_to_user(str(target.id), {
        "event": "friend_request",
        "data": {"from_user_id": str(current_user.id), "username": current_user.username},
    })
    if not manager.is_online(str(target.id)):
        try:
            from app.services.fcm import send_to_user as _fcm
            name = current_user.display_name or current_user.username
            await _fcm(str(target.id),
                       title="Новая заявка в друзья",
                       body=f"{name} хочет добавить вас в друзья",
                       data={"from_user_id": str(current_user.id)})
        except Exception:
            import logging
            logging.getLogger("hiroo.fcm").exception("friend push failed")
    return req


@router.post("/request/{request_id}/accept", response_model=FriendRequestResponse)
async def accept_request(
    request_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(
        select(FriendRequest)
        .options(selectinload(FriendRequest.from_user), selectinload(FriendRequest.to_user))
        .where(
            FriendRequest.id == request_id,
            FriendRequest.to_user_id == current_user.id,
            FriendRequest.status == "pending",
        )
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Friend request not found")
    req.status = "accepted"
    await db.flush()
    return req


@router.post("/request/{request_id}/reject", status_code=204)
async def reject_request(
    request_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(
        select(FriendRequest).where(
            FriendRequest.id == request_id,
            FriendRequest.to_user_id == current_user.id,
            FriendRequest.status == "pending",
        )
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Friend request not found")
    req.status = "rejected"


@router.delete("/{user_id}", status_code=204)
async def unfriend(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(
        select(FriendRequest).where(
            or_(
                and_(FriendRequest.from_user_id == current_user.id, FriendRequest.to_user_id == user_id),
                and_(FriendRequest.from_user_id == user_id, FriendRequest.to_user_id == current_user.id),
            ),
            FriendRequest.status == "accepted",
        )
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Not friends")
    await db.delete(req)


@router.get("/blocked", response_model=list[FriendResponse])
async def list_blocked(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(
        select(FriendRequest).where(
            FriendRequest.from_user_id == current_user.id,
            FriendRequest.status == "blocked",
        )
    )
    requests = result.scalars().all()
    blocked = []
    for req in requests:
        user_result = await db.execute(select(User).where(User.id == req.to_user_id))
        u = user_result.scalar_one_or_none()
        if u:
            blocked.append(u)
    return blocked


@router.post("/block/{user_id}", status_code=204)
async def block_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    existing = await db.execute(
        select(FriendRequest).where(
            or_(
                and_(FriendRequest.from_user_id == current_user.id, FriendRequest.to_user_id == user_id),
                and_(FriendRequest.from_user_id == user_id, FriendRequest.to_user_id == current_user.id),
            )
        )
    )
    req = existing.scalar_one_or_none()
    if req:
        req.status = "blocked"
        req.from_user_id = current_user.id
        req.to_user_id = user_id
    else:
        db.add(FriendRequest(from_user_id=current_user.id, to_user_id=user_id, status="blocked"))


@router.delete("/block/{user_id}", status_code=204)
async def unblock_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(
        select(FriendRequest).where(
            FriendRequest.from_user_id == current_user.id,
            FriendRequest.to_user_id == user_id,
            FriendRequest.status == "blocked",
        )
    )
    req = result.scalar_one_or_none()
    if req:
        await db.delete(req)