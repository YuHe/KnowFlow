from __future__ import annotations

from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/knowflow"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    SECRET_KEY: str = "change-me-in-production-use-a-long-random-string"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:8192"]

    # Public URL
    PUBLIC_BASE_URL: str = "http://localhost:8192"

    # Storage
    STORAGE_TYPE: str = "local"
    STORAGE_LOCAL_PATH: str = "/data/uploads"
    MAX_UPLOAD_SIZE_MB: int = 100
    IMAGE_MAX_SIZE_MB: int = 10

    # Document
    MAX_VERSIONS_PER_DOC: int = 50

    # Registration
    ALLOW_REGISTRATION: bool = True

    # Site
    SITE_NAME: str = "KnowFlow"
    SITE_DESCRIPTION: str = ""

    # Super admin seed
    SUPER_ADMIN_EMAIL: str = "admin@example.com"
    SUPER_ADMIN_USERNAME: str = "admin"
    SUPER_ADMIN_PASSWORD: str = "admin123"


settings = Settings()
