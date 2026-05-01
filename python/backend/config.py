"""Runtime settings for the VibroLab backend."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[2]
RUNTIME_DIR = BASE_DIR / "runtime"


def normalize_public_path(value: str | None) -> str:
    raw = (value or "").strip()
    if not raw or raw == "/":
        return ""
    return "/" + raw.strip("/")


@dataclass(slots=True)
class Settings:
    app_name: str = "VibroLab API"
    database_url: str = os.getenv("VIBROLAB_DATABASE_URL", f"sqlite:///{(RUNTIME_DIR / 'vibrolab.db').as_posix()}")
    session_cookie_name: str = os.getenv("VIBROLAB_SESSION_COOKIE", "vm_session")
    session_ttl_days: int = int(os.getenv("VIBROLAB_SESSION_TTL_DAYS", "14"))
    secure_cookies: bool = os.getenv("VIBROLAB_SECURE_COOKIES", "0") == "1"
    allow_origins: list[str] = tuple(
        origin.strip()
        for origin in os.getenv("VIBROLAB_ALLOW_ORIGINS", "http://localhost:8000,http://localhost:8080").split(",")
        if origin.strip()
    )
    public_base_path: str = normalize_public_path(os.getenv("VIBROLAB_PUBLIC_BASE_PATH", ""))


def get_settings() -> Settings:
    """Build a fresh settings object from the environment."""

    return Settings()
