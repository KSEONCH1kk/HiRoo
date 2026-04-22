"""Helpers for the user block-list. Kept tiny so every path that needs to
check a block can do so with a single await."""
import uuid
from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.block import UserBlock


async def either_blocks(a: uuid.UUID, b: uuid.UUID, db: AsyncSession) -> bool:
    """True if either direction of the relationship is blocked."""
    r = await db.execute(
        select(UserBlock).where(
            or_(
                and_(UserBlock.blocker_id == a, UserBlock.blocked_id == b),
                and_(UserBlock.blocker_id == b, UserBlock.blocked_id == a),
            )
        ).limit(1)
    )
    return r.scalar_one_or_none() is not None


async def blocked_by_me(me: uuid.UUID, other: uuid.UUID, db: AsyncSession) -> bool:
    r = await db.execute(
        select(UserBlock).where(
            UserBlock.blocker_id == me, UserBlock.blocked_id == other
        ).limit(1)
    )
    return r.scalar_one_or_none() is not None


async def my_block_ids(me: uuid.UUID, db: AsyncSession) -> set[uuid.UUID]:
    rows = await db.execute(
        select(UserBlock.blocked_id).where(UserBlock.blocker_id == me)
    )
    return {row[0] for row in rows.all()}
