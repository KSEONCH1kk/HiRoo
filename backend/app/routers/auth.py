from datetime import timedelta, datetime, timezone
import hashlib
import uuid
import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request, Cookie
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.deps import get_db, get_redis, get_current_active_user
from app.core.security import (
    get_password_hash, verify_password,
    create_access_token, create_refresh_token, verify_refresh_token
)
from app.core.config import settings
from app.core.rate_limit import limiter, LIMIT_AUTH
from app.models.user import User
from app.models.session import Session as UserSession
from app.schemas.user import UserCreate, UserLogin, TokenResponse, UserResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _hash_token(t: str) -> str:
    return hashlib.sha256(t.encode("utf-8")).hexdigest()


def _client_meta(request: Request) -> tuple[str, str]:
    xff = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    ip = xff or (request.client.host if request.client else "")
    ua = (request.headers.get("user-agent") or "")[:400]
    return ip, ua


async def _create_session(db: AsyncSession, user_id: uuid.UUID, refresh_token: str,
                          request: Request) -> UserSession:
    ip, ua = _client_meta(request)
    s = UserSession(
        user_id=user_id, refresh_token_hash=_hash_token(refresh_token),
        ip=ip or None, user_agent=ua or None,
    )
    db.add(s)
    await db.flush()
    return s


@router.post("/register", response_model=TokenResponse, status_code=201)
@limiter.limit(LIMIT_AUTH)
async def register(
    request: Request,
    body: UserCreate,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    # Check duplicates
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    result = await db.execute(select(User).where(User.username == body.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username already taken")

    user = User(
        email=body.email,
        username=body.username,
        display_name=body.display_name,
        hashed_password=get_password_hash(body.password),
        status="online",
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})
    await _create_session(db, user.id, refresh_token, request)

    response.set_cookie(
        "refresh_token", refresh_token,
        httponly=True, secure=settings.is_production,
        samesite="lax", max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/",
    )
    return TokenResponse(access_token=access_token, user=UserResponse.model_validate(user))


@router.post("/login", response_model=TokenResponse)
@limiter.limit(LIMIT_AUTH)
async def login(
    request: Request,
    body: UserLogin,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if user.is_banned:
        raise HTTPException(status_code=403, detail="Account banned")

    user.status = "online"
    await db.flush()

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})
    await _create_session(db, user.id, refresh_token, request)

    response.set_cookie(
        "refresh_token", refresh_token,
        httponly=True, secure=settings.is_production,
        samesite="lax", max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/",
    )
    return TokenResponse(access_token=access_token, user=UserResponse.model_validate(user))


@router.post("/logout", status_code=204)
async def logout(
    request: Request,
    response: Response,
    refresh_token: str | None = Cookie(default=None),
    redis: aioredis.Redis = Depends(get_redis),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    from fastapi.security import HTTPBearer
    credentials = await HTTPBearer(auto_error=False)(request)
    if credentials:
        ttl = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        await redis.setex(f"blacklist:{credentials.credentials}", ttl, "1")

    # Kill the matching session row so /settings/devices reflects the logout.
    if refresh_token:
        tok_hash = _hash_token(refresh_token)
        sess_res = await db.execute(
            select(UserSession).where(UserSession.refresh_token_hash == tok_hash)
        )
        s = sess_res.scalar_one_or_none()
        if s:
            await db.delete(s)

    response.delete_cookie("refresh_token", path="/")

    current_user.status = "offline"


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit(LIMIT_AUTH)
async def refresh(
    request: Request,
    response: Response,
    refresh_token: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    exc = HTTPException(status_code=401, detail="Invalid refresh token")
    if not refresh_token:
        raise exc

    payload = verify_refresh_token(refresh_token)
    if not payload:
        raise exc

    if await redis.get(f"blacklist_refresh:{refresh_token}"):
        raise exc

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user or user.is_banned:
        raise exc

    # Look up the session this refresh belongs to — we need it to update the
    # hash on rotation and to enforce explicit revoke from /settings/devices.
    tok_hash = _hash_token(refresh_token)
    sess_res = await db.execute(
        select(UserSession).where(UserSession.refresh_token_hash == tok_hash)
    )
    sess = sess_res.scalar_one_or_none()
    if sess is None:
        # Revoked (or never tracked — legacy tokens from before this change).
        raise exc

    # Rotate refresh token.
    await redis.setex(
        f"blacklist_refresh:{refresh_token}",
        settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        "1",
    )
    new_access = create_access_token({"sub": str(user.id)})
    new_refresh = create_refresh_token({"sub": str(user.id)})

    sess.refresh_token_hash = _hash_token(new_refresh)
    sess.last_used_at = datetime.now(timezone.utc)
    ip, ua = _client_meta(request)
    if ip: sess.ip = ip
    if ua: sess.user_agent = ua
    await db.flush()

    response.set_cookie(
        "refresh_token", new_refresh,
        httponly=True, secure=settings.is_production,
        samesite="lax", max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/",
    )
    return TokenResponse(access_token=new_access, user=UserResponse.model_validate(user))


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_active_user)):
    return current_user
