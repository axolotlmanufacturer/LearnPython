"""Application settings, read from the environment with sensible local defaults."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# apps/api/app/config.py -> repository root
REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "learnpython-api"
    version: str = "0.1.0"
    environment: str = "development"

    database_url: str = "postgresql+asyncpg://postgres:postgres@127.0.0.1:5432/learnpython"

    # Curriculum lives in the repository as files and is loaded into the database.
    # See docs/architecture.md §4.
    content_dir: Path = REPO_ROOT / "content"

    # Session cookie. `secure` is forced on outside development.
    session_cookie_name: str = "lp_session"
    session_ttl_days: int = 30

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in {"production", "prod"}

    @property
    def cookie_secure(self) -> bool:
        return self.is_production


@lru_cache
def get_settings() -> Settings:
    return Settings()
