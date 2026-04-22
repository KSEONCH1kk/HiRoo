"""Developer app management — create / update / delete / list."""
import uuid
import secrets

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pathlib import Path
import aiofiles

from app.core.config import settings
from app.core.deps import get_db, get_current_active_user
from app.models.user import User
from app.models.application import Application, Bot
from app.schemas.application import (
    ApplicationCreate, ApplicationCreateResponse,
    ApplicationUpdate, ApplicationResponse,
    BotCreateResponse, BotTokenResetResponse,
)
from app.services.app_tokens import (
    generate_client_id, generate_client_secret,
    generate_bot_token, hash_secret,
)

router = APIRouter(prefix="/api/applications", tags=["applications"])


def _to_response(app: Application, has_bot: bool) -> dict:
    data = {c.name: getattr(app, c.name) for c in app.__table__.columns}
    data["has_bot"] = has_bot
    return data


async def _load_own_app(app_id: uuid.UUID, user: User, db: AsyncSession) -> Application:
    res = await db.execute(select(Application).where(Application.id == app_id))
    app = res.scalar_one_or_none()
    if not app:
        raise HTTPException(404, "Приложение не найдено")
    if app.owner_id != user.id and not user.is_platform_admin:
        raise HTTPException(403, "Только владелец может редактировать приложение")
    return app


@router.get("", response_model=list[ApplicationResponse])
async def list_my_apps(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    res = await db.execute(
        select(Application).where(Application.owner_id == current_user.id)
        .order_by(Application.created_at.desc())
    )
    apps = list(res.scalars().all())
    # Batch-fetch which have bots.
    bot_res = await db.execute(
        select(Bot.application_id).where(Bot.application_id.in_([a.id for a in apps]))
    )
    with_bot = {row[0] for row in bot_res.all()}
    return [_to_response(a, a.id in with_bot) for a in apps]


@router.post("", response_model=ApplicationCreateResponse, status_code=201)
async def create_app(
    body: ApplicationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    secret = generate_client_secret()
    app = Application(
        owner_id=current_user.id,
        name=body.name,
        description=body.description,
        client_id=generate_client_id(),
        client_secret_hash=hash_secret(secret),
        redirect_uris=[],
    )
    db.add(app)
    await db.flush()
    await db.refresh(app)
    return {**_to_response(app, False), "client_secret": secret}


@router.get("/{app_id}", response_model=ApplicationResponse)
async def get_app(
    app_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    app = await _load_own_app(app_id, current_user, db)
    bot_res = await db.execute(select(Bot).where(Bot.application_id == app.id))
    return _to_response(app, bot_res.scalar_one_or_none() is not None)


@router.patch("/{app_id}", response_model=ApplicationResponse)
async def update_app(
    app_id: uuid.UUID,
    body: ApplicationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    app = await _load_own_app(app_id, current_user, db)
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(app, field, val)
    await db.flush()
    await db.refresh(app)
    bot_res = await db.execute(select(Bot).where(Bot.application_id == app.id))
    return _to_response(app, bot_res.scalar_one_or_none() is not None)


@router.delete("/{app_id}", status_code=204)
async def delete_app(
    app_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    app = await _load_own_app(app_id, current_user, db)
    await db.delete(app)


@router.post("/{app_id}/secret/reset")
async def reset_secret(
    app_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    app = await _load_own_app(app_id, current_user, db)
    secret = generate_client_secret()
    app.client_secret_hash = hash_secret(secret)
    await db.flush()
    return {"client_secret": secret}


# ── Bot ───────────────────────────────────────────────────────────────────

@router.post("/{app_id}/bot", response_model=BotCreateResponse)
async def create_bot(
    app_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Attach a bot user to this application. A bot is just a User with
    is_bot=True; it can't log in with password but authenticates by Bot token."""
    app = await _load_own_app(app_id, current_user, db)
    existing = await db.execute(select(Bot).where(Bot.application_id == app_id))
    if existing.scalar_one_or_none():
        raise HTTPException(409, "У приложения уже есть бот")

    # Bot usernames are auto-derived but must be unique. Fall back with a random suffix.
    base = (app.name or "bot").lower().replace(" ", "_")[:24]
    base = "".join(c if c.isalnum() or c in "_.-" else "_" for c in base) or "bot"
    username = base
    from sqlalchemy import func as _func
    for _attempt in range(5):
        dup = await db.execute(select(User).where(_func.lower(User.username) == username))
        if not dup.scalar_one_or_none():
            break
        username = f"{base}_{secrets.token_hex(3)}"

    bot_user = User(
        email=f"bot+{app.client_id}@hiroo.local",
        username=username,
        hashed_password="!",               # cannot log in with password
        display_name=app.name,
        avatar_url=app.icon_url,
        status="offline",
        is_verified=False,
        is_bot=True,
    )
    db.add(bot_user)
    await db.flush()
    await db.refresh(bot_user)

    token = generate_bot_token(bot_user.id)
    bot = Bot(
        application_id=app.id,
        user_id=bot_user.id,
        token_hash=hash_secret(token),
        token_suffix=token[-4:],
        shard_count=1,
    )
    db.add(bot)
    await db.flush()
    return BotCreateResponse(
        application_id=app.id,
        bot_user_id=bot_user.id,
        token=token,
        token_suffix=token[-4:],
        shard_count=1,
    )


@router.post("/{app_id}/bot/token/reset", response_model=BotTokenResetResponse)
async def reset_bot_token(
    app_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    app = await _load_own_app(app_id, current_user, db)
    res = await db.execute(select(Bot).where(Bot.application_id == app_id))
    bot = res.scalar_one_or_none()
    if not bot:
        raise HTTPException(404, "Бот не создан")
    token = generate_bot_token(bot.user_id)
    bot.token_hash = hash_secret(token)
    bot.token_suffix = token[-4:]
    await db.flush()
    return BotTokenResetResponse(token=token, token_suffix=bot.token_suffix)


@router.post("/{app_id}/icon", response_model=ApplicationResponse)
async def upload_icon(
    app_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if file.content_type not in {"image/png", "image/jpeg", "image/webp"}:
        raise HTTPException(415, "Только PNG/JPEG/WebP")
    app = await _load_own_app(app_id, current_user, db)
    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(413, "Слишком большой файл")
    upload_dir = Path(settings.UPLOAD_DIR) / "app-icons"
    upload_dir.mkdir(parents=True, exist_ok=True)
    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "png"
    dest = upload_dir / f"{app.id}.{ext}"
    async with aiofiles.open(dest, "wb") as f:
        await f.write(content)
    app.icon_url = f"/uploads/app-icons/{app.id}.{ext}"
    # If bot exists, sync avatar.
    bot_res = await db.execute(select(Bot).where(Bot.application_id == app.id))
    bot = bot_res.scalar_one_or_none()
    if bot:
        ur = await db.execute(select(User).where(User.id == bot.user_id))
        bu = ur.scalar_one_or_none()
        if bu:
            bu.avatar_url = app.icon_url
    await db.flush()
    await db.refresh(app)
    return _to_response(app, bot is not None)
