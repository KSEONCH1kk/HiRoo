"""Desktop app update channel.

Electron-шелл опрашивает /api/desktop/latest при старте (во время сплэш-
экрана). Если версия новее, чем `app.getVersion()`, десктоп скачивает
подходящий инсталлер из `assets[<platform>-<arch>]` и запускает его
молча — без диалогов, с прогрессом на сплэше.
"""
import os
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/desktop", tags=["desktop"])


class LatestResponse(BaseModel):
    version: str
    notes: str = ""
    # Легаси-поле, оставлено для обратной совместимости со старыми шеллами.
    download_url: str = ""
    # Прямые ссылки на инсталлеры для каждой пары platform-arch. Ключи —
    # process.platform + "-" + process.arch ("win32-x64", "darwin-arm64",
    # "linux-x64"). Также допустимы "win32"/"darwin"/"linux" без -arch как
    # фолбэк.
    assets: dict[str, str] = {}
    mandatory: bool = False


# Env-vars:
#   HIROO_DESKTOP_VERSION=1.2.0
#   HIROO_DESKTOP_NOTES="New screen share picker + bug fixes"
#   HIROO_DESKTOP_DOWNLOAD_URL=https://hiroo.intave.tech/downloads/HiRoo-1.2.0-Setup.exe
#   HIROO_DESKTOP_WIN_X64_URL=https://.../HiRoo-1.2.0-win-x64.exe
#   HIROO_DESKTOP_WIN_ARM64_URL=https://.../HiRoo-1.2.0-win-arm64.exe
#   HIROO_DESKTOP_MAC_X64_URL=https://.../HiRoo-1.2.0-mac-x64.dmg
#   HIROO_DESKTOP_MAC_ARM64_URL=https://.../HiRoo-1.2.0-mac-arm64.dmg
#   HIROO_DESKTOP_LINUX_X64_URL=https://.../hiroo_1.2.0_amd64.deb
#   HIROO_DESKTOP_MANDATORY=1


def _assets() -> dict[str, str]:
    m = {}
    for key, env in [
        ("win32-x64",    "HIROO_DESKTOP_WIN_X64_URL"),
        ("win32-arm64",  "HIROO_DESKTOP_WIN_ARM64_URL"),
        ("darwin-x64",   "HIROO_DESKTOP_MAC_X64_URL"),
        ("darwin-arm64", "HIROO_DESKTOP_MAC_ARM64_URL"),
        ("linux-x64",    "HIROO_DESKTOP_LINUX_X64_URL"),
        ("linux-arm64",  "HIROO_DESKTOP_LINUX_ARM64_URL"),
    ]:
        v = os.getenv(env)
        if v:
            m[key] = v
    return m


@router.get("/latest", response_model=LatestResponse)
async def latest_version():
    return LatestResponse(
        version=os.getenv("HIROO_DESKTOP_VERSION", "1.0.0"),
        notes=os.getenv("HIROO_DESKTOP_NOTES", ""),
        download_url=os.getenv("HIROO_DESKTOP_DOWNLOAD_URL", ""),
        assets=_assets(),
        mandatory=os.getenv("HIROO_DESKTOP_MANDATORY", "").lower() in ("1", "true", "yes"),
    )
