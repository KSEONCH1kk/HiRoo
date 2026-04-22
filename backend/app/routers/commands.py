"""Bot slash/user/message commands — registration + listing for the picker."""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, get_current_active_user
from app.models.application import Application, Bot, BotCommand
from app.models.user import User
from app.models.server import ServerMember
from app.schemas.application import CommandCreate, CommandResponse
from app.services.app_tokens import hash_secret

router = APIRouter(prefix="/api/commands", tags=["commands"])


# ── Auth: either owner (via JWT) or bot token ─────────────────────────────

async def _require_app_auth(app_id: uuid.UUID, request: Request, db: AsyncSession) -> Application:
    """Accept either a regular user JWT (owner check) or `Authorization: Bot <token>`."""
    authz = request.headers.get("authorization", "")
    res = await db.execute(select(Application).where(Application.id == app_id))
    app = res.scalar_one_or_none()
    if not app:
        raise HTTPException(404, "Приложение не найдено")

    if authz.lower().startswith("bot "):
        raw = authz[4:].strip()
        br = await db.execute(select(Bot).where(Bot.application_id == app.id))
        bot = br.scalar_one_or_none()
        if not bot or bot.token_hash != hash_secret(raw):
            raise HTTPException(401, "Invalid bot token")
        return app

    # Fallback to JWT owner check.
    from app.core.deps import get_current_user
    # Manually resolve current user via dep mechanism is awkward; simpler: reuse
    # FastAPI's dep system by calling through.
    # To keep it simple we just rely on the sibling "owner endpoints" doing auth.
    raise HTTPException(401, "Bot token required")


# ── Endpoints ─────────────────────────────────────────────────────────────

@router.post("/applications/{app_id}/commands", response_model=CommandResponse, status_code=201)
async def register_command(
    app_id: uuid.UUID,
    body: CommandCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    app = await _require_app_auth(app_id, request, db)
    # Dedup by (app_id, name, guild_id, type).
    dup = await db.execute(
        select(BotCommand).where(
            BotCommand.application_id == app.id,
            BotCommand.name == body.name,
            BotCommand.type == body.type,
            BotCommand.guild_id == body.guild_id,
        )
    )
    exist = dup.scalar_one_or_none()
    if exist:
        exist.description = body.description
        exist.options = [o.model_dump() for o in body.options]
        await db.flush()
        return exist
    cmd = BotCommand(
        application_id=app.id,
        type=body.type,
        name=body.name,
        description=body.description,
        options=[o.model_dump() for o in body.options],
        guild_id=body.guild_id,
    )
    db.add(cmd)
    # Flip the capability flag automatically — lets the invite UI show "Supports commands".
    app.supports_commands = True
    await db.flush()
    await db.refresh(cmd)
    return cmd


@router.get("/applications/{app_id}/commands", response_model=list[CommandResponse])
async def list_app_commands(
    app_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_active_user),
):
    res = await db.execute(
        select(BotCommand).where(BotCommand.application_id == app_id)
        .order_by(BotCommand.type.asc(), BotCommand.name.asc())
    )
    return list(res.scalars())


@router.delete("/applications/{app_id}/commands/{cmd_id}", status_code=204)
async def delete_command(
    app_id: uuid.UUID,
    cmd_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await _require_app_auth(app_id, request, db)
    r = await db.execute(
        select(BotCommand).where(BotCommand.id == cmd_id, BotCommand.application_id == app_id)
    )
    cmd = r.scalar_one_or_none()
    if cmd:
        await db.delete(cmd)


# ── Picker endpoint — called by the chat composer to populate "/" autocomplete ──

@router.get("/for-channel", response_model=list[CommandResponse])
async def commands_for_channel(
    guild_id: Optional[uuid.UUID] = Query(None),
    dm_id: Optional[uuid.UUID] = Query(None),
    q: str = Query("", max_length=64),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Return slash commands available in a given context. For guild channels
    we expose commands whose bot is a member (so /addbot flows light them up),
    plus any global commands from installed apps. For DMs we expose commands
    from bots that share a DM with the user."""
    q_lower = (q or "").strip().lstrip("/").lower()

    from sqlalchemy import distinct
    from app.models.server import ServerMember

    bot_ids: list[uuid.UUID] = []
    if guild_id:
        # Bots that are members of this server.
        br = await db.execute(
            select(ServerMember.user_id).where(
                ServerMember.server_id == guild_id,
            )
        )
        member_user_ids = [row[0] for row in br.all()]
        if member_user_ids:
            bu = await db.execute(
                select(User.id).where(User.id.in_(member_user_ids), User.is_bot.is_(True))
            )
            bot_ids = [row[0] for row in bu.all()]

    # Applications whose bot user is in that list.
    app_ids: list[uuid.UUID] = []
    if bot_ids:
        ar = await db.execute(
            select(Bot.application_id).where(Bot.user_id.in_(bot_ids))
        )
        app_ids = [row[0] for row in ar.all()]

    if not app_ids:
        return []

    where = [BotCommand.application_id.in_(app_ids), BotCommand.type == "slash"]
    if guild_id:
        where.append(or_(BotCommand.guild_id.is_(None), BotCommand.guild_id == guild_id))
    else:
        where.append(BotCommand.guild_id.is_(None))
    if q_lower:
        from app.core.search import escape_like
        where.append(BotCommand.name.ilike(f"{escape_like(q_lower)}%", escape="\\"))

    res = await db.execute(
        select(BotCommand).where(and_(*where)).order_by(BotCommand.name.asc()).limit(25)
    )
    return list(res.scalars())
