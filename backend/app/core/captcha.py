"""Captcha-челлендж для чувствительных auth-endpoint'ов.

По умолчанию — hCaptcha (бесплатный тариф, совместимая с reCAPTCHA v2 API).
Включается через HCAPTCHA_SECRET env-var. Если секрет не задан и флаг
ENFORCE не выставлен — пропускаем молча (удобно в dev).

Frontend получает sitekey через /api/meta/captcha и рендерит виджет,
потом шлёт токен в поле `captcha_token` тела запроса.
"""
from __future__ import annotations

import logging
import os

import httpx
from fastapi import HTTPException, Request

log = logging.getLogger("hiroo.captcha")

HCAPTCHA_SECRET = os.getenv("HCAPTCHA_SECRET", "").strip()
HCAPTCHA_SITEKEY = os.getenv("HCAPTCHA_SITEKEY", "").strip()
# Для dev/CI — 10000000-ffff-ffff-ffff-000000000001 это «всегда-успех»
# тестовая пара от hCaptcha; держим как фолбэк в явном виде.
DEV_SITEKEY = "10000000-ffff-ffff-ffff-000000000001"
DEV_SECRET = "0x0000000000000000000000000000000000000000"

ENFORCE = os.getenv("HIROO_ENFORCE_CAPTCHA", "0").lower() in ("1", "true", "yes")
VERIFY_URL = "https://api.hcaptcha.com/siteverify"


def public_sitekey() -> str:
    """Sitekey для публичного /api/meta/captcha."""
    return HCAPTCHA_SITEKEY or DEV_SITEKEY


async def verify_captcha(token: str | None, request: Request) -> None:
    """Бросает HTTPException(400) если капча обязательна и не прошла."""
    # Dev-ключи — пропускаем любой токен без проверки: тест-пара hCaptcha
    # всегда валидна, но не ходим в сеть.
    secret = HCAPTCHA_SECRET or (DEV_SECRET if not ENFORCE else "")

    if not secret:
        if not ENFORCE:
            return
        raise HTTPException(status_code=500, detail="captcha misconfigured")

    if not token:
        raise HTTPException(status_code=400, detail="captcha token required")

    # remote_ip помогает hCaptcha отличать batch-атаки
    ip = (request.headers.get("x-forwarded-for", "").split(",")[0].strip()
          or (request.client.host if request.client else ""))

    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            r = await c.post(VERIFY_URL, data={
                "secret": secret,
                "response": token,
                "remoteip": ip or "",
                "sitekey": HCAPTCHA_SITEKEY or DEV_SITEKEY,
            })
            data = r.json()
    except Exception as e:
        log.warning("hcaptcha verify failed: %s", e)
        # В прод-моде падаем на стороне безопасности — не впускаем, если
        # провайдер недоступен. В dev (ENFORCE=0) — разрешаем.
        if ENFORCE:
            raise HTTPException(status_code=503, detail="captcha provider unavailable")
        return

    if not data.get("success"):
        raise HTTPException(status_code=400, detail="captcha failed")
