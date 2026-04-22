"""Helpers to enforce per-user privacy preferences (DMs / friend requests)."""
import uuid
from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.friend import FriendRequest
from app.models.user import User


async def are_friends(a: uuid.UUID, b: uuid.UUID, db: AsyncSession) -> bool:
    r = await db.execute(
        select(FriendRequest).where(
            or_(
                and_(FriendRequest.from_user_id == a, FriendRequest.to_user_id == b),
                and_(FriendRequest.from_user_id == b, FriendRequest.to_user_id == a),
            ),
            FriendRequest.status == "accepted",
        ).limit(1)
    )
    return r.scalar_one_or_none() is not None


async def can_send_friend_request(sender: User, target: User, db: AsyncSession) -> bool:
    if getattr(target, "friend_request_permission", "everyone") == "friends":
        # "friends" setting = only mutual friends can add — which never works
        # as a first request, so effectively locks new requests.
        return await are_friends(sender.id, target.id, db)
    return True


async def can_dm(sender: User, target: User, db: AsyncSession) -> bool:
    if getattr(target, "dm_permission", "everyone") == "friends":
        return await are_friends(sender.id, target.id, db)
    return True
