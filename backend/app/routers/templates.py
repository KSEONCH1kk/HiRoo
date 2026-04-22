"""Server templates — serialise a server's structure (channels, roles,
cosmetic settings) into a shareable code. Recipients can spin up a new
server from the snapshot or merge it into a server they own.

Private data is intentionally excluded: no messages, no members, no
invites, no icons, no soundboard audio, no tokens — only the structural
scaffolding.
"""
from __future__ import annotations
import secrets
import string
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.deps import (
    get_db, get_current_active_user, require_permission, compute_permissions,
)
from app.core.security import generate_invite_code
from app.models.channel import Channel
from app.models.channel_permission import ChannelRolePermission
from app.models.role import Role, MemberRole, Permissions
from app.models.server import Server, ServerMember
from app.models.template import ServerTemplate
from app.models.user import User
from app.services.websocket_service import manager


router = APIRouter(prefix="/api/servers/{server_id}/templates", tags=["templates"])
public_router = APIRouter(prefix="/api/templates", tags=["templates"])


CODE_ALPHABET = string.ascii_letters + string.digits + "_-"


def _gen_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(12))


# ─── Schemas ────────────────────────────────────────────────────────────

class TemplateOut(BaseModel):
    model_config = {"from_attributes": True}
    id: uuid.UUID
    code: str
    name: str
    description: str | None = None
    creator_id: uuid.UUID | None = None
    source_server_id: uuid.UUID | None = None
    usage_count: int = 0
    created_at: datetime
    url: str = ""
    payload: dict | None = None


class TemplateCreateBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)


class ApplyBody(BaseModel):
    """Used by both "create new server from template" and
    "apply to existing server" — the latter needs a target server_id."""
    server_name: str | None = Field(None, min_length=1, max_length=100)
    target_server_id: uuid.UUID | None = None
    # Merge strategy when applying to existing server:
    # - "append"  (default): add everything, keep existing
    # - "replace": delete existing channels+roles first, then add
    mode: str = Field("append", pattern=r"^(append|replace)$")


# ─── Helpers ────────────────────────────────────────────────────────────

def _public_url_for_code(code: str) -> str:
    for o in settings.CORS_ORIGINS:
        if o.startswith("https://"):
            return f"{o.rstrip('/')}/templates/{code}"
    return f"https://hiroo.intave.tech/templates/{code}"


def _to_out(tpl: ServerTemplate, include_payload: bool = False) -> TemplateOut:
    out = TemplateOut.model_validate(tpl)
    out.url = _public_url_for_code(tpl.code)
    if include_payload:
        out.payload = tpl.payload
    else:
        out.payload = None
    return out


async def _snapshot_server(db: AsyncSession, server: Server) -> dict:
    """Capture channels, roles, channel-level overrides, tag, description."""
    ch_res = await db.execute(
        select(Channel).where(Channel.server_id == server.id).order_by(Channel.position)
    )
    channels = [
        {
            "key": str(c.id),  # reference key for channel-role overrides
            "name": c.name,
            "type": c.type,
            "position": c.position,
            "topic": getattr(c, "topic", None),
        }
        for c in ch_res.scalars()
    ]

    r_res = await db.execute(
        select(Role).where(Role.server_id == server.id).order_by(Role.position)
    )
    roles = [
        {
            "key": str(r.id),
            "name": r.name,
            "color": r.color,
            "position": r.position,
            "permissions": int(r.permissions or 0),
            "hoist": bool(r.hoist),
            "mentionable": bool(r.mentionable),
            "is_everyone": bool(r.is_everyone),
        }
        for r in r_res.scalars()
    ]

    ov_res = await db.execute(
        select(ChannelRolePermission)
        .join(Channel, Channel.id == ChannelRolePermission.channel_id)
        .where(Channel.server_id == server.id)
    )
    overrides = [
        {
            "channel_key": str(ov.channel_id),
            "role_key": str(ov.role_id),
            "allow": int(ov.allow or 0),
            "deny": int(ov.deny or 0),
        }
        for ov in ov_res.scalars()
    ]

    return {
        "version": 1,
        "settings": {
            "description": server.description,
            "tag_label": server.tag_label,
            "tag_icon": server.tag_icon,
        },
        "channels": channels,
        "roles": roles,
        "channel_role_overrides": overrides,
    }


async def _instantiate(
    db: AsyncSession, server: Server, payload: dict, *,
    mode: str = "append", current_user: User | None = None,
) -> None:
    """Apply a template payload to `server`. Used by both the create-new
    and apply-to-existing flows."""
    if mode == "replace":
        # Remove non-@everyone roles; @everyone is kept and gets re-imposed.
        ex_roles = await db.execute(
            select(Role).where(Role.server_id == server.id, Role.is_everyone == False)
        )
        for r in ex_roles.scalars():
            await db.delete(r)
        ex_channels = await db.execute(
            select(Channel).where(Channel.server_id == server.id)
        )
        for c in ex_channels.scalars():
            await db.delete(c)
        await db.flush()

    # Build old_key → new_id mapping as we create everything.
    role_map: dict[str, uuid.UUID] = {}
    # Preserve @everyone mapping when it already exists.
    ev_res = await db.execute(
        select(Role).where(Role.server_id == server.id, Role.is_everyone == True)
    )
    existing_everyone = ev_res.scalar_one_or_none()

    for r in payload.get("roles", []):
        if r.get("is_everyone"):
            if existing_everyone:
                # Overwrite perms on the already-present @everyone row instead
                # of creating a duplicate (unique by is_everyone+server).
                existing_everyone.permissions = int(r.get("permissions", 0))
                existing_everyone.color = r.get("color") or existing_everyone.color
                role_map[r["key"]] = existing_everyone.id
                continue
        role = Role(
            server_id=server.id,
            name=r["name"][:50],
            color=r.get("color") or "#99aab5",
            position=int(r.get("position", 0)),
            permissions=int(r.get("permissions", 0)),
            hoist=bool(r.get("hoist", False)),
            mentionable=bool(r.get("mentionable", False)),
            is_everyone=bool(r.get("is_everyone", False)),
        )
        db.add(role)
        await db.flush()
        role_map[r["key"]] = role.id

    ch_map: dict[str, uuid.UUID] = {}
    for c in payload.get("channels", []):
        ch = Channel(
            server_id=server.id,
            name=c["name"][:100],
            type=c.get("type", "text"),
            position=int(c.get("position", 0)),
            topic=c.get("topic"),
        )
        db.add(ch)
        await db.flush()
        ch_map[c["key"]] = ch.id

    for ov in payload.get("channel_role_overrides", []):
        cid = ch_map.get(ov.get("channel_key"))
        rid = role_map.get(ov.get("role_key"))
        if not cid or not rid:
            continue
        db.add(ChannelRolePermission(
            channel_id=cid, role_id=rid,
            allow=int(ov.get("allow", 0)),
            deny=int(ov.get("deny", 0)),
        ))

    s = payload.get("settings", {}) or {}
    if s.get("description") is not None and not server.description:
        server.description = s["description"][:500]
    if s.get("tag_label") and not server.tag_label:
        server.tag_label = s["tag_label"][:8]
    if s.get("tag_icon") and not server.tag_icon:
        from app.services.tag_icons import is_valid_tag_icon
        if is_valid_tag_icon(s["tag_icon"]):
            server.tag_icon = s["tag_icon"]

    await db.flush()


# ─── Server-scoped endpoints (create / list / delete) ──────────────────

@router.post("", response_model=TemplateOut, status_code=201)
@router.post("/", response_model=TemplateOut, status_code=201, include_in_schema=False)
async def create_template(
    server_id: uuid.UUID,
    body: TemplateCreateBody,
    db: AsyncSession = Depends(get_db),
    admin: ServerMember = Depends(require_permission(Permissions.MANAGE_SERVER)),
    current_user: User = Depends(get_current_active_user),
):
    sr = await db.execute(select(Server).where(Server.id == server_id))
    server = sr.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    payload = await _snapshot_server(db, server)
    # Collision-resistant short code (unique constraint acts as backstop).
    for _ in range(5):
        code = _gen_code()
        exists = await db.execute(select(ServerTemplate.id).where(ServerTemplate.code == code))
        if exists.scalar_one_or_none() is None:
            break
    else:
        raise HTTPException(status_code=500, detail="Не удалось сгенерировать код, попробуйте ещё")

    tpl = ServerTemplate(
        code=code,
        name=body.name.strip(),
        description=(body.description or None),
        creator_id=current_user.id,
        source_server_id=server.id,
        payload=payload,
    )
    db.add(tpl)
    await db.flush()
    await db.refresh(tpl)
    return _to_out(tpl, include_payload=False)


@router.get("", response_model=list[TemplateOut])
@router.get("/", response_model=list[TemplateOut], include_in_schema=False)
async def list_templates(
    server_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ServerMember = Depends(require_permission(Permissions.MANAGE_SERVER)),
):
    res = await db.execute(
        select(ServerTemplate)
        .where(ServerTemplate.source_server_id == server_id)
        .order_by(ServerTemplate.created_at.desc())
    )
    return [_to_out(t, include_payload=False) for t in res.scalars()]


@router.delete("/{template_id}", status_code=204)
async def delete_template(
    server_id: uuid.UUID,
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ServerMember = Depends(require_permission(Permissions.MANAGE_SERVER)),
):
    res = await db.execute(
        select(ServerTemplate).where(
            ServerTemplate.id == template_id,
            ServerTemplate.source_server_id == server_id,
        )
    )
    tpl = res.scalar_one_or_none()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(tpl)


# ─── Public preview + apply ─────────────────────────────────────────────

@public_router.get("/{code}", response_model=TemplateOut)
async def preview_template(
    code: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_active_user),
):
    res = await db.execute(select(ServerTemplate).where(ServerTemplate.code == code))
    tpl = res.scalar_one_or_none()
    if not tpl:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    # Include payload so the preview UI can show channel/role counts.
    return _to_out(tpl, include_payload=True)


@public_router.post("/{code}/create-server", response_model=dict)
async def create_server_from_template(
    code: str,
    body: ApplyBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    res = await db.execute(select(ServerTemplate).where(ServerTemplate.code == code))
    tpl = res.scalar_one_or_none()
    if not tpl:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    server_name = (body.server_name or tpl.name).strip()
    if not server_name:
        raise HTTPException(status_code=400, detail="Укажите имя сервера")

    server = Server(
        name=server_name[:100],
        owner_id=current_user.id,
        invite_code=generate_invite_code(),
    )
    db.add(server)
    await db.flush()

    db.add(ServerMember(server_id=server.id, user_id=current_user.id, role="owner"))
    # Seed @everyone — _instantiate will merge into it.
    db.add(Role(
        server_id=server.id, name="@everyone", color="#99aab5",
        position=0, permissions=Permissions.DEFAULT, is_everyone=True,
    ))
    await db.flush()

    await _instantiate(db, server, tpl.payload, mode="replace", current_user=current_user)

    tpl.usage_count = (tpl.usage_count or 0) + 1
    await db.flush()
    return {"id": str(server.id), "name": server.name}


@public_router.post("/{code}/apply", response_model=dict)
async def apply_template_to_existing(
    code: str,
    body: ApplyBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if not body.target_server_id:
        raise HTTPException(status_code=400, detail="Укажите сервер-цель")
    res = await db.execute(select(ServerTemplate).where(ServerTemplate.code == code))
    tpl = res.scalar_one_or_none()
    if not tpl:
        raise HTTPException(status_code=404, detail="Шаблон не найден")

    sr = await db.execute(select(Server).where(Server.id == body.target_server_id))
    server = sr.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Сервер не найден")

    perms = await compute_permissions(server.id, current_user.id, db)
    if not ((perms & Permissions.MANAGE_SERVER) or (perms & Permissions.ADMIN)):
        raise HTTPException(status_code=403, detail="Нет права управлять этим сервером")

    await _instantiate(db, server, tpl.payload, mode=body.mode or "append",
                       current_user=current_user)

    tpl.usage_count = (tpl.usage_count or 0) + 1
    await db.flush()

    # Notify connected clients so channel lists refresh.
    try:
        await manager.broadcast_to_server(str(server.id), {
            "event": "server_structure_changed",
            "data": {"server_id": str(server.id)},
        })
    except Exception:
        pass

    return {"id": str(server.id), "name": server.name}
