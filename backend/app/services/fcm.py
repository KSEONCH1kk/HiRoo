"""Firebase Cloud Messaging sender (HTTP v1 API).

Requires a service-account JSON with the "FCM Messaging" role; point
env var FIREBASE_CREDENTIALS_PATH to it, and set FIREBASE_PROJECT_ID.

On cold start we cache an OAuth2 access token (1 hour TTL) so each send
is one HTTP request, not two.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models.device import DeviceToken

log = logging.getLogger("hiroo.fcm")

FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging"
FCM_HOST = "https://fcm.googleapis.com"

_token_cache: dict[str, Any] = {"value": None, "expires_at": 0.0, "project_id": None}


def _config_ok() -> bool:
    return bool(os.getenv("FIREBASE_CREDENTIALS_PATH") and os.getenv("FIREBASE_PROJECT_ID"))


async def _get_access_token() -> tuple[str | None, str | None]:
    """Return (access_token, project_id) or (None, None) if FCM isn't configured."""
    if not _config_ok():
        return None, None
    project_id = os.environ["FIREBASE_PROJECT_ID"]

    now = time.time()
    if _token_cache["value"] and _token_cache["expires_at"] > now + 60:
        return _token_cache["value"], project_id

    # Lazy-import so servers without the FCM cred don't pay the import cost.
    try:
        from google.oauth2 import service_account
        from google.auth.transport.requests import Request
    except ImportError as e:
        log.warning("google-auth import failed: %s — try `pip install google-auth requests`", e)
        return None, None

    creds_path = os.environ["FIREBASE_CREDENTIALS_PATH"]
    loop = asyncio.get_running_loop()

    def _refresh() -> str:
        creds = service_account.Credentials.from_service_account_file(creds_path, scopes=[FCM_SCOPE])
        creds.refresh(Request())
        return creds.token

    try:
        token = await loop.run_in_executor(None, _refresh)
    except Exception as e:
        log.exception("FCM credentials refresh failed: %s", e)
        return None, project_id

    _token_cache["value"] = token
    _token_cache["expires_at"] = now + 55 * 60  # refresh a few min early
    _token_cache["project_id"] = project_id
    return token, project_id


async def _send_one(client: httpx.AsyncClient, access_token: str, project_id: str,
                    device_token: str, message: dict) -> tuple[bool, str | None]:
    url = f"{FCM_HOST}/v1/projects/{project_id}/messages:send"
    body = {"message": {"token": device_token, **message}}
    r = await client.post(
        url,
        json=body,
        headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
        timeout=10,
    )
    if r.status_code in (200, 201):
        return True, None
    # 404 / UNREGISTERED → token is stale, caller should drop it.
    try: err = r.json().get("error", {}).get("status", "")
    except Exception: err = ""
    return False, err


async def _drop_token(db: AsyncSession, token: str) -> None:
    rows = await db.execute(select(DeviceToken).where(DeviceToken.token == token))
    for t in rows.scalars():
        await db.delete(t)
    await db.flush()


async def send_to_user(user_id: str, *, title: str, body: str, data: dict | None = None) -> int:
    """Deliver a push to every live device belonging to `user_id`. Returns
    the number of successful deliveries. Silently returns 0 if FCM isn't
    configured — this lets callers fire-and-forget without worrying."""
    access_token, project_id = await _get_access_token()
    if not access_token or not project_id:
        return 0

    import uuid as _uuid
    try:
        uid = _uuid.UUID(user_id)
    except Exception:
        return 0

    async with AsyncSessionLocal() as db:
        rows = await db.execute(select(DeviceToken).where(DeviceToken.user_id == uid))
        tokens = list(rows.scalars())
        if not tokens:
            return 0

        message: dict = {
            "notification": {"title": title, "body": body[:240]},
            "android": {
                "priority": "HIGH",
                "notification": {
                    "channel_id": "hiroo_mentions",
                    "color": "#7c5cff",
                    "click_action": "FLUTTER_NOTIFICATION_CLICK",  # safe on Capacitor
                },
            },
            "apns": {"payload": {"aps": {"sound": "default", "badge": 1}}},
        }
        if data:
            message["data"] = {k: str(v) for k, v in data.items()}

        delivered = 0
        async with httpx.AsyncClient() as client:
            # FCM HTTP v1 doesn't support multicast — one request per token.
            # For small counts (a user has typically 1-3 devices) this is fine.
            results = await asyncio.gather(*[
                _send_one(client, access_token, project_id, t.token, message)
                for t in tokens
            ], return_exceptions=True)

        for t, result in zip(tokens, results):
            if isinstance(result, tuple):
                ok, err = result
                if ok:
                    delivered += 1
                elif err in ("NOT_FOUND", "UNREGISTERED", "INVALID_ARGUMENT"):
                    await _drop_token(db, t.token)
            else:
                log.warning("FCM send failed: %s", result)
        await db.commit()
        return delivered
