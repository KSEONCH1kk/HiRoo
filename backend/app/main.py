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
from app.routers import auth, users, servers, channels, messages, friends, dms, inbox, voice, ws, uploads, roles, unfurl
from app.routers import webhooks as webhooks_router

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
    yield

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

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
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
app.include_router(users.router)
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


@app.get("/health")
async def health():
    return {"status": "ok"}
