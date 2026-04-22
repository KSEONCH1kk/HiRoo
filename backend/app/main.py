import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.core.rate_limit import limiter
from app.middleware.security import SecurityHeadersMiddleware
from app.middleware.logging import LoggingMiddleware
from app.routers import auth, users, servers, channels, messages, friends, dms, inbox, voice, ws, uploads, roles, unfurl, proxy, qr_auth, soundboard, templates as templates_router
from app.routers import webhooks as webhooks_router
from app.routers import applications as applications_router
from app.routers import oauth2 as oauth2_router
from app.routers import commands as commands_router
from app.routers import bot_gateway as bot_gateway_router
from app.routers import interactions as interactions_router
from app.routers import desktop as desktop_router
from app.routers import mobile as mobile_router

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")

MIGRATIONS = [
    "ALTER TABLE servers ADD COLUMN IF NOT EXISTS is_discoverable BOOLEAN NOT NULL DEFAULT FALSE",
    "CREATE INDEX IF NOT EXISTS ix_servers_is_discoverable ON servers (is_discoverable)",
    "ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS type VARCHAR(16) NOT NULL DEFAULT 'text'",
    "ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES dm_messages(id) ON DELETE SET NULL",
    "ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS icon_url VARCHAR(255)",
    "ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE SET NULL",
    "UPDATE direct_messages SET owner_id = (SELECT user_id FROM dm_participants WHERE dm_id = direct_messages.id ORDER BY joined_at ASC LIMIT 1) WHERE is_group = TRUE AND owner_id IS NULL",
    """
    CREATE TABLE IF NOT EXISTS channel_role_permissions (
        channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        allow BIGINT NOT NULL DEFAULT 0,
        deny BIGINT NOT NULL DEFAULT 0,
        PRIMARY KEY (channel_id, role_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS webhooks (
        id UUID PRIMARY KEY,
        channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        name VARCHAR(80) NOT NULL,
        avatar_url VARCHAR(255),
        token VARCHAR(64) NOT NULL UNIQUE,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_webhooks_channel_id ON webhooks (channel_id)",
    "ALTER TABLE messages ADD COLUMN IF NOT EXISTS webhook_id UUID REFERENCES webhooks(id) ON DELETE SET NULL",
    "ALTER TABLE messages ADD COLUMN IF NOT EXISTS webhook_name VARCHAR(80)",
    "ALTER TABLE messages ADD COLUMN IF NOT EXISTS webhook_avatar_url VARCHAR(255)",
    "ALTER TABLE messages ADD COLUMN IF NOT EXISTS embeds JSONB",
    """
    CREATE TABLE IF NOT EXISTS server_bans (
        server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        banned_by UUID REFERENCES users(id) ON DELETE SET NULL,
        reason VARCHAR(500),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (server_id, user_id)
    )
    """,
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS public_key VARCHAR(128)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS signing_public_key VARCHAR(128)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT FALSE",
    "CREATE INDEX IF NOT EXISTS ix_users_is_bot ON users (is_bot)",
    "ALTER TABLE messages ADD COLUMN IF NOT EXISTS components JSONB",
    "ALTER TABLE messages ADD COLUMN IF NOT EXISTS application_id UUID",
    # device_tokens table — also created by Base.metadata.create_all but
    # listing here makes the intent explicit and safe on already-running DBs.
    """
    CREATE TABLE IF NOT EXISTS device_tokens (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(512) NOT NULL UNIQUE,
        platform VARCHAR(16) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        last_used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_device_tokens_user_id ON device_tokens (user_id)",
    """
    CREATE TABLE IF NOT EXISTS user_blocks (
        blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        PRIMARY KEY (blocker_id, blocked_id)
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_user_blocks_blocked ON user_blocks (blocked_id)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS dm_permission VARCHAR(16) NOT NULL DEFAULT 'everyone'",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS friend_request_permission VARCHAR(16) NOT NULL DEFAULT 'everyone'",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS show_online_status BOOLEAN NOT NULL DEFAULT TRUE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_sound BOOLEAN NOT NULL DEFAULT TRUE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_desktop BOOLEAN NOT NULL DEFAULT TRUE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_level VARCHAR(16) NOT NULL DEFAULT 'mentions'",
    """
    CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        refresh_token_hash VARCHAR(64) NOT NULL,
        ip VARCHAR(64),
        user_agent VARCHAR(400),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        last_used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_sessions_user_id ON sessions (user_id)",
    "CREATE INDEX IF NOT EXISTS ix_sessions_refresh_token_hash ON sessions (refresh_token_hash)",
    # Server clan tags: short label + icon key shown next to usernames for
    # members who picked that server as their active tag source.
    "ALTER TABLE servers ADD COLUMN IF NOT EXISTS tag_label VARCHAR(8)",
    "ALTER TABLE servers ADD COLUMN IF NOT EXISTS tag_icon VARCHAR(32)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS active_tag_server_id UUID REFERENCES servers(id) ON DELETE SET NULL",
    "CREATE INDEX IF NOT EXISTS ix_users_active_tag_server_id ON users (active_tag_server_id)",
    # Soundboard sounds — short audio clips (≤ 30s) uploaded per server.
    """
    CREATE TABLE IF NOT EXISTS soundboard_sounds (
        id UUID PRIMARY KEY,
        server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        name VARCHAR(32) NOT NULL,
        emoji VARCHAR(8),
        uploader_id UUID REFERENCES users(id) ON DELETE SET NULL,
        file_path VARCHAR(255) NOT NULL,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_soundboard_sounds_server_id ON soundboard_sounds (server_id)",
    # USE_SOUNDBOARD = 1 << 19 = 524288. Retroactively grant it to every
    # existing @everyone role on servers created before the permission bit
    # existed, so current members can actually hear/play sounds without an
    # admin re-editing every role.
    "UPDATE roles SET permissions = permissions | 524288 WHERE is_everyone = TRUE AND (permissions & 524288) = 0",
    # Server templates — serialised snapshots of channels/roles/settings.
    """
    CREATE TABLE IF NOT EXISTS server_templates (
        id UUID PRIMARY KEY,
        code VARCHAR(16) NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL,
        description VARCHAR(500),
        creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
        source_server_id UUID REFERENCES servers(id) ON DELETE SET NULL,
        payload JSONB NOT NULL,
        usage_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_server_templates_code ON server_templates (code)",
    "CREATE INDEX IF NOT EXISTS ix_server_templates_source ON server_templates (source_server_id)",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables
    from app.database import engine, Base
    from app import models  # noqa: F401
    from sqlalchemy import text
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for stmt in MIGRATIONS:
            try:
                await conn.execute(text(stmt))
            except Exception as e:
                logging.warning("migration skipped: %s (%s)", stmt, e)
    # Create upload dirs
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
    Path(f"{settings.UPLOAD_DIR}/avatars").mkdir(exist_ok=True)

    # Attach Redis pub-sub to the WebSocket manager so fan-out works across
    # backend replicas. Single-replica setups keep working since publish
    # still delivers to the same process via Redis loopback.
    try:
        import redis.asyncio as aioredis
        from app.services.websocket_service import manager as ws_manager
        redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=False)
        await ws_manager.start(redis_client)
    except Exception as e:
        logging.warning("ws pub-sub not attached, running local-only: %s", e)

    yield

    try:
        from app.services.websocket_service import manager as ws_manager
        await ws_manager.stop()
    except Exception:
        pass

app = FastAPI(
    title="HiRoo API",
    version="1.0.0",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    lifespan=lifespan,
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# CORS — also whitelist Capacitor's synthetic origins so our Android / iOS
# shell can talk to the API. On Android WebView the origin is "https://localhost",
# on iOS "capacitor://localhost".
_CORS_ORIGINS = list(settings.CORS_ORIGINS) + [
    "https://localhost",
    "capacitor://localhost",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Custom middleware
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(LoggingMiddleware)

# Exception handlers
register_exception_handlers(app)

# Static files for uploads
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# Routers
app.include_router(auth.router)
app.include_router(qr_auth.router)
app.include_router(soundboard.router)
app.include_router(soundboard.me_router)
app.include_router(templates_router.router)
app.include_router(templates_router.public_router)
app.include_router(users.router)
app.include_router(users.tag_icons_router)
app.include_router(servers.router)
app.include_router(channels.router)
app.include_router(messages.router)
app.include_router(friends.router)
app.include_router(dms.router)
app.include_router(inbox.router)
app.include_router(voice.router)
app.include_router(ws.router)
app.include_router(uploads.router)
app.include_router(roles.router)
app.include_router(unfurl.router)
app.include_router(webhooks_router.channel_router)
app.include_router(webhooks_router.public_router)
app.include_router(proxy.router)
app.include_router(applications_router.router)
app.include_router(oauth2_router.router)
app.include_router(commands_router.router)
app.include_router(bot_gateway_router.router)
app.include_router(interactions_router.router)
app.include_router(desktop_router.router)
app.include_router(mobile_router.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
