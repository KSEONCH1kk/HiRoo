"""Desktop app update channel.

The Electron shell pings /api/desktop/latest on start-up; if the reported
version is newer than the shell's own `app.getVersion()`, a non-blocking
dialog invites the user to grab the installer.
"""
import os
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/desktop", tags=["desktop"])


class LatestResponse(BaseModel):
    version: str
    notes: str = ""
    download_url: str = ""
    mandatory: bool = False


# Stored in env vars so ops can bump a new release without a code deploy:
#   HIROO_DESKTOP_VERSION=1.2.0
#   HIROO_DESKTOP_NOTES="New screen share picker + bug fixes"
#   HIROO_DESKTOP_DOWNLOAD_URL=https://hiroo.intave.tech/downloads/HiRoo-1.2.0-Setup.exe

@router.get("/latest", response_model=LatestResponse)
async def latest_version():
    return LatestResponse(
        version=os.getenv("HIROO_DESKTOP_VERSION", "1.0.0"),
        notes=os.getenv("HIROO_DESKTOP_NOTES", ""),
        download_url=os.getenv("HIROO_DESKTOP_DOWNLOAD_URL", "https://hiroo.intave.tech/download"),
        mandatory=os.getenv("HIROO_DESKTOP_MANDATORY", "").lower() in ("1", "true", "yes"),
    )
