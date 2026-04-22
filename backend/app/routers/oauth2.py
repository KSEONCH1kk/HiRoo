"""OAuth2 Authorization Code flow + bot-invite flow."""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, get_current_active_user
from app.models.user import User
from app.models.application import (
    Application, Bot, OAuth2AuthorizationCode, OAuth2Token,
)
from app.schemas.application import OAuth2TokenResponse
from app.services.app_tokens import (
    generate_oauth2_code, generate_access_token, generate_refresh_token,
    hash_secret, verify_secret,
)

router = APIRouter(prefix="/api/oauth2", tags=["oauth2"])


# Canonical scope list. Third-party apps request a space-separated subset of these.
VALID_SCOPES = {
    "identify",        # basic profile
    "email",
    "dms.read",
    "guilds",          # list of servers the user is in
    "guilds.join",     # add user to a server
    "bot",             # invite the app's bot to a server (authorize endpoint only)
    "applications.commands",  # register commands (for bot invites)
}


def _split_scope(s: str | None) -> set[str]:
    return {part for part in (s or "").split() if part}


def _join_scope(s: set[str]) -> str:
    return " ".join(sorted(s))


# ── /authorize (consent prep) ─────────────────────────────────────────────
# The actual consent UI lives on the frontend at /oauth2/authorize. This
# endpoint returns the info needed to render it.

@router.get("/authorize/info")
async def authorize_info(
    client_id: str = Query(..., max_length=32),
    scope: str = Query("identify"),
    redirect_uri: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    res = await db.execute(select(Application).where(Application.client_id == client_id))
    app = res.scalar_one_or_none()
    if not app:
        raise HTTPException(400, "Unknown client_id")
    if redirect_uri not in (app.redirect_uris or []):
        # Bot-invite flows may omit redirect_uri from the stored list; we still
        # require an exact match for non-bot flows to prevent open redirects.
        if "bot" not in _split_scope(scope):
            raise HTTPException(400, "redirect_uri не в whitelist приложения")

    requested = _split_scope(scope)
    bad = requested - VALID_SCOPES
    if bad:
        raise HTTPException(400, f"Неизвестные scopes: {sorted(bad)}")

    return {
        "application": {
            "id": str(app.id),
            "client_id": app.client_id,
            "name": app.name,
            "icon_url": app.icon_url,
            "description": app.description,
            "is_verified": app.is_verified,
            "supports_commands": app.supports_commands,
            "supports_voice": app.supports_voice,
        },
        "scope": sorted(requested),
        "user": {
            "id": str(current_user.id),
            "username": current_user.username,
            "avatar_url": current_user.avatar_url,
        },
    }


@router.post("/authorize")
async def authorize_approve(
    client_id: str = Form(...),
    redirect_uri: str = Form(...),
    scope: str = Form("identify"),
    state: str | None = Form(None),
    guild_id: str | None = Form(None),   # for bot installs
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    res = await db.execute(select(Application).where(Application.client_id == client_id))
    app = res.scalar_one_or_none()
    if not app:
        raise HTTPException(400, "Unknown client_id")

    requested = _split_scope(scope)
    if requested - VALID_SCOPES:
        raise HTTPException(400, "Unsupported scopes")
    if redirect_uri not in (app.redirect_uris or []) and "bot" not in requested:
        raise HTTPException(400, "redirect_uri не в whitelist приложения")

    # Bot invite: add the bot User as a ServerMember of guild_id.
    if "bot" in requested and guild_id:
        from app.models.server import Server, ServerMember
        bot_res = await db.execute(select(Bot).where(Bot.application_id == app.id))
        bot = bot_res.scalar_one_or_none()
        if not bot:
            raise HTTPException(400, "У приложения нет бота")
        g_res = await db.execute(select(Server).where(Server.id == uuid.UUID(guild_id)))
        g = g_res.scalar_one_or_none()
        if not g:
            raise HTTPException(404, "Сервер не найден")
        # Requires the caller to have invite perm on the target guild. We check
        # server membership + MANAGE_SERVER.
        from app.core.deps import compute_permissions
        from app.models.role import Permissions
        perms = await compute_permissions(g.id, current_user.id, db)
        if not (perms & Permissions.MANAGE_SERVER):
            raise HTTPException(403, "Нужно право управлять сервером")
        dup = await db.execute(select(ServerMember).where(
            ServerMember.server_id == g.id, ServerMember.user_id == bot.user_id,
        ))
        if not dup.scalar_one_or_none():
            db.add(ServerMember(server_id=g.id, user_id=bot.user_id, role="member"))
        await db.flush()

    # Mint a code.
    code = generate_oauth2_code()
    auth = OAuth2AuthorizationCode(
        code=code,
        application_id=app.id,
        user_id=current_user.id,
        redirect_uri=redirect_uri,
        scope=_join_scope(requested),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )
    db.add(auth)
    await db.flush()
    location = f"{redirect_uri}{'&' if '?' in redirect_uri else '?'}code={code}"
    if state:
        location += f"&state={state}"
    return {"location": location}


# ── /token (exchange + refresh) ───────────────────────────────────────────

@router.post("/token", response_model=OAuth2TokenResponse)
async def token_exchange(
    grant_type: str = Form(...),
    client_id: str = Form(...),
    client_secret: str = Form(...),
    code: Optional[str] = Form(None),
    redirect_uri: Optional[str] = Form(None),
    refresh_token: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Application).where(Application.client_id == client_id))
    app = res.scalar_one_or_none()
    if not app or not verify_secret(client_secret, app.client_secret_hash):
        raise HTTPException(401, "Invalid client credentials")

    user_id: uuid.UUID
    scope: str

    if grant_type == "authorization_code":
        if not code or not redirect_uri:
            raise HTTPException(400, "code и redirect_uri обязательны")
        cr = await db.execute(
            select(OAuth2AuthorizationCode).where(OAuth2AuthorizationCode.code == code)
        )
        c = cr.scalar_one_or_none()
        if not c or c.application_id != app.id:
            raise HTTPException(400, "Invalid code")
        if c.redirect_uri != redirect_uri:
            raise HTTPException(400, "redirect_uri mismatch")
        if c.expires_at < datetime.now(timezone.utc):
            await db.delete(c)
            raise HTTPException(400, "Code expired")
        user_id = c.user_id
        scope = c.scope
        await db.delete(c)
    elif grant_type == "refresh_token":
        if not refresh_token:
            raise HTTPException(400, "refresh_token required")
        rh = hash_secret(refresh_token)
        tr = await db.execute(select(OAuth2Token).where(
            OAuth2Token.refresh_token_hash == rh,
            OAuth2Token.application_id == app.id,
        ))
        t = tr.scalar_one_or_none()
        if not t or t.revoked_at is not None:
            raise HTTPException(400, "Invalid refresh_token")
        user_id = t.user_id
        scope = t.scope
        t.revoked_at = datetime.now(timezone.utc)
    else:
        raise HTTPException(400, "Unsupported grant_type")

    access = generate_access_token()
    refresh = generate_refresh_token()
    expires_in = 7 * 24 * 3600  # 7 days
    tok = OAuth2Token(
        application_id=app.id,
        user_id=user_id,
        access_token_hash=hash_secret(access),
        refresh_token_hash=hash_secret(refresh),
        scope=scope,
        expires_at=datetime.now(timezone.utc) + timedelta(seconds=expires_in),
    )
    db.add(tok)
    await db.flush()
    return OAuth2TokenResponse(
        access_token=access,
        expires_in=expires_in,
        refresh_token=refresh,
        scope=scope,
    )


@router.post("/revoke")
async def revoke_token(
    token: str = Form(...),
    client_id: str = Form(...),
    client_secret: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Application).where(Application.client_id == client_id))
    app = res.scalar_one_or_none()
    if not app or not verify_secret(client_secret, app.client_secret_hash):
        raise HTTPException(401, "Invalid client credentials")
    h = hash_secret(token)
    tr = await db.execute(select(OAuth2Token).where(
        OAuth2Token.application_id == app.id,
        (OAuth2Token.access_token_hash == h) | (OAuth2Token.refresh_token_hash == h),
    ))
    for t in tr.scalars():
        t.revoked_at = datetime.now(timezone.utc)
    return {"ok": True}


async def oauth2_bearer(
    authorization: str | None = None,
    db: AsyncSession = None,
    required_scope: str | None = None,
) -> tuple[User, OAuth2Token]:
    """Resolve an OAuth2 Bearer token to (user, token). `authorization` should
    be the raw `Authorization` header value."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Bearer token required")
    raw = authorization[7:].strip()
    h = hash_secret(raw)
    tr = await db.execute(select(OAuth2Token).where(OAuth2Token.access_token_hash == h))
    tok = tr.scalar_one_or_none()
    if not tok or tok.revoked_at is not None:
        raise HTTPException(401, "Invalid token")
    if tok.expires_at < datetime.now(timezone.utc):
        raise HTTPException(401, "Token expired")
    if required_scope and required_scope not in _split_scope(tok.scope):
        raise HTTPException(403, f"Missing scope: {required_scope}")
    ur = await db.execute(select(User).where(User.id == tok.user_id))
    user = ur.scalar_one_or_none()
    if not user or user.is_banned:
        raise HTTPException(401, "User unavailable")
    return user, tok


@router.get("/@me")
async def oauth2_me(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Canonical /identify — returns the user who granted the access token."""
    user, tok = await oauth2_bearer(
        request.headers.get("authorization"), db, required_scope="identify",
    )
    data = {
        "id": str(user.id),
        "username": user.username,
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
        "scope": tok.scope,
    }
    if "email" in _split_scope(tok.scope):
        data["email"] = user.email
    return data


@router.get("/guilds")
async def oauth2_guilds(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user, _tok = await oauth2_bearer(
        request.headers.get("authorization"), db, required_scope="guilds",
    )
    from app.models.server import Server, ServerMember
    sr = await db.execute(
        select(Server).join(ServerMember, ServerMember.server_id == Server.id)
        .where(ServerMember.user_id == user.id)
    )
    return [
        {"id": str(s.id), "name": s.name, "icon_url": s.icon_url, "owner_id": str(s.owner_id)}
        for s in sr.scalars()
    ]
