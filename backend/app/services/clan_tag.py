"""Enriches user objects with their active clan-tag for API responses.

The tag is computed from `user.active_tag_server_id`:
  - If the FK is null → no tag.
  - If the referenced server has no tag_label/tag_icon → no tag.
  - If the user is no longer a member of that server → no tag.

We re-check membership on every read so revoking works without a
background cleanup job: once a user leaves the tag-source server, their
tag simply stops rendering on the next request.

For list endpoints (e.g. /api/channels/{id}/messages) pass the list of
users through `attach_tags()` — it batches all the JOIN queries so we
don't end up with N+1.
"""
from __future__ import annotations
import uuid
from typing import Iterable
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.server import Server, ServerMember
from app.schemas.user import ClanTag


async def get_tag_for_user(db: AsyncSession, user: User) -> ClanTag | None:
    sid = getattr(user, "active_tag_server_id", None)
    if not sid:
        return None
    sr = await db.execute(select(Server).where(Server.id == sid))
    server = sr.scalar_one_or_none()
    if not server or not server.tag_label or not server.tag_icon:
        return None
    mr = await db.execute(
        select(ServerMember).where(
            ServerMember.server_id == sid,
            ServerMember.user_id == user.id,
        )
    )
    if not mr.scalar_one_or_none():
        return None
    return ClanTag(
        label=server.tag_label,
        icon=server.tag_icon,
        server_id=server.id,
        server_name=server.name,
    )


async def get_tags_for_users(
    db: AsyncSession, users: Iterable[User]
) -> dict[uuid.UUID, ClanTag]:
    """Batched variant — one query for all involved servers, one for all
    memberships. Returns {user_id: ClanTag}."""
    user_list = [u for u in users if getattr(u, "active_tag_server_id", None)]
    if not user_list:
        return {}

    server_ids = {u.active_tag_server_id for u in user_list}
    sr = await db.execute(select(Server).where(Server.id.in_(server_ids)))
    servers: dict[uuid.UUID, Server] = {s.id: s for s in sr.scalars()}

    # Only keep servers that actually have a tag configured — avoids a
    # follow-up membership check for ones that can never produce a tag.
    servers = {
        sid: s for sid, s in servers.items() if s.tag_label and s.tag_icon
    }
    if not servers:
        return {}

    relevant_users = [u for u in user_list if u.active_tag_server_id in servers]
    if not relevant_users:
        return {}

    # Batch membership lookup: SELECT … WHERE (server_id, user_id) IN (…)
    pairs = [(u.active_tag_server_id, u.id) for u in relevant_users]
    from sqlalchemy import tuple_, and_
    mr = await db.execute(
        select(ServerMember.server_id, ServerMember.user_id).where(
            tuple_(ServerMember.server_id, ServerMember.user_id).in_(pairs)
        )
    )
    valid = {(row.server_id, row.user_id) for row in mr.all()}

    out: dict[uuid.UUID, ClanTag] = {}
    for u in relevant_users:
        if (u.active_tag_server_id, u.id) not in valid:
            continue
        s = servers[u.active_tag_server_id]
        out[u.id] = ClanTag(
            label=s.tag_label, icon=s.tag_icon,
            server_id=s.id, server_name=s.name,
        )
    return out
