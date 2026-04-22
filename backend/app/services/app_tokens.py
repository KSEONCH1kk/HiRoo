"""Helpers for minting bot tokens, client secrets, OAuth2 codes."""
from __future__ import annotations

import hashlib
import hmac
import secrets
import string
import uuid

from app.core.config import settings


_ALPHA = string.ascii_letters + string.digits


def generate_client_id() -> str:
    return "".join(secrets.choice(string.digits) for _ in range(19))  # 19-digit snowflake-ish


def generate_client_secret() -> str:
    return secrets.token_urlsafe(32)


def generate_bot_token(bot_user_id: uuid.UUID) -> str:
    """Bot tokens are structured as <uid_b64>.<ts>.<hmac> like Discord. Not
    strictly required but lets us sanity-check a token before hitting the DB."""
    from base64 import urlsafe_b64encode
    import time as _time

    uid_part = urlsafe_b64encode(bot_user_id.bytes).rstrip(b"=").decode()
    ts_part = urlsafe_b64encode(int(_time.time()).to_bytes(5, "big")).rstrip(b"=").decode()
    body = f"{uid_part}.{ts_part}"
    sig = hmac.new(settings.SECRET_KEY.encode(), body.encode(), hashlib.sha256).hexdigest()[:27]
    return f"{body}.{sig}"


def generate_oauth2_code() -> str:
    return secrets.token_urlsafe(24)


def generate_access_token() -> str:
    return secrets.token_urlsafe(32)


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(32)


def hash_secret(s: str) -> str:
    """One-way hash for storing long-lived secrets (client_secret, bot token,
    OAuth2 tokens). Not password-grade — these values have high entropy."""
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def verify_secret(plain: str, stored_hash: str) -> bool:
    return hmac.compare_digest(hash_secret(plain), stored_hash)
