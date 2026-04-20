from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from typing import List
import json


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    DATABASE_URL: str = "postgresql+asyncpg://hiroo:hiroo@localhost:5432/hiroo"
    REDIS_URL: str = "redis://localhost:6379"
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    REFRESH_SECRET_KEY: str = "dev-refresh-secret-key-change-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]
    ENVIRONMENT: str = "development"
    MAX_UPLOAD_SIZE: int = 8_388_608  # 8 MB
    UPLOAD_DIR: str = "uploads"

    # LiveKit SFU (optional — voice works without, falls back to mesh if empty)
    LIVEKIT_URL: str = ""         # e.g. wss://hiroo.intave.tech/livekit
    LIVEKIT_API_KEY: str = ""
    LIVEKIT_API_SECRET: str = ""

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors(cls, v):
        if isinstance(v, str):
            return json.loads(v)
        return v

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"


settings = Settings()
