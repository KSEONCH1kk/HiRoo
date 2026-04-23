"""X-Super-Properties — клиентский отпечаток для защиты auth-endpoint'ов
от скриптовых ботов.

Формат копирует Discord: header `X-Super-Properties` содержит base64-JSON
с полями клиента. Любой из них может измениться в новой версии, поэтому
сервер валидирует только базовый набор: наличие, тип, build_number выше
минимального, client_version по regex.

Для своих эндпоинтов стек защиты: капча на login/register + этот отпечаток
на всех чувствительных auth-путях. Bot-токены (Authorization: Bot …)
проходят мимо — к ним это не применяется.
"""
from __future__ import annotations

import base64
import json
import os
from typing import Any

from fastapi import Request, HTTPException

# Минимальный build_number, который мы считаем «свежим». Поднимается при
# каждом релизе, клиенты ниже — отказ с 400. Можно переопределить через env.
MIN_BUILD = int(os.getenv("HIROO_MIN_CLIENT_BUILD", "1"))

# Если флаг выключен — не валидируем (dev-среда, маунт фронта без прослойки).
ENFORCE = os.getenv("HIROO_ENFORCE_SUPER_PROPS", "1").lower() in ("1", "true", "yes")

ALLOWED_PLATFORMS = {"web", "desktop", "ios", "android"}


def parse_super_props(raw: str) -> dict[str, Any]:
    """Разобрать base64-JSON. На любой сбой — ValueError."""
    if not raw:
        raise ValueError("missing")
    # Разрешаем padding-free base64.
    padded = raw + "=" * (-len(raw) % 4)
    try:
        data = base64.b64decode(padded, validate=False)
    except Exception as e:
        raise ValueError(f"not base64: {e}") from e
    try:
        parsed = json.loads(data.decode("utf-8"))
    except Exception as e:
        raise ValueError(f"not json: {e}") from e
    if not isinstance(parsed, dict):
        raise ValueError("not an object")
    return parsed


def validate_super_props(props: dict[str, Any]) -> None:
    """Проверить минимальный контракт. Бросает ValueError с причиной."""
    plat = props.get("platform")
    if plat not in ALLOWED_PLATFORMS:
        raise ValueError(f"bad platform: {plat!r}")

    build = props.get("build_number")
    if not isinstance(build, int) or build < MIN_BUILD:
        raise ValueError(f"bad build_number: {build!r} (min {MIN_BUILD})")

    version = props.get("client_version", "")
    if not isinstance(version, str) or not version:
        raise ValueError("missing client_version")
    # Лёгкая проверка — не строже формата "X.Y.Z[-tag]"
    if len(version) > 32 or any(ch not in "0123456789.-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ" for ch in version):
        raise ValueError(f"bad client_version: {version!r}")

    # locale / tz — произвольные, но ограничим длину, чтобы не пихали мусор
    for fld in ("locale", "timezone"):
        v = props.get(fld, "")
        if v and (not isinstance(v, str) or len(v) > 48):
            raise ValueError(f"bad {fld}")


def require_super_props(request: Request) -> dict[str, Any] | None:
    """FastAPI-dependency. Для bot-токенов возвращает None (пропускает).
    Для обычных клиентов — валидирует заголовок, иначе 400.
    Возвращает распаршенный dict."""
    # Bot-токены освобождены — интеграции не ходят через фронт.
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bot "):
        return None

    raw = request.headers.get("x-super-properties")
    if not ENFORCE:
        if raw:
            try:
                return parse_super_props(raw)
            except Exception:
                return None
        return None

    if not raw:
        raise HTTPException(status_code=400, detail="client fingerprint required")
    try:
        props = parse_super_props(raw)
        validate_super_props(props)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"bad fingerprint: {e}") from None
    return props
