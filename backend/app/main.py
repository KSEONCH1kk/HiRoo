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
from app.routers import auth, users, servers, channels, messages, friends, dms, inbox, voice, ws, uploads, roles

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")

MIGRATIONS = [
    "ALTER TABLE servers ADD COLUMN IF NOT EXISTS is_discoverable BOOLEAN NOT NULL DEFAULT FALSE",
    "CREATE INDEX IF NOT EXISTS ix_servers_is_discoverable ON servers (is_discoverable)",
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


@app.get("/health")
async def health():
    return {"status": "ok"}
