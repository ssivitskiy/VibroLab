"""Database engine helpers."""

from __future__ import annotations

from pathlib import Path
from typing import Iterator

from fastapi import Request
from sqlmodel import Session, SQLModel, create_engine

SQLITE_MIGRATIONS: dict[str, dict[str, str]] = {
    "inspection": {
        "measurement_id": "TEXT",
        "work_status": "TEXT NOT NULL DEFAULT 'observe'",
        "work_status_label": "TEXT NOT NULL DEFAULT 'Наблюдать'",
        "is_baseline": "INTEGER NOT NULL DEFAULT 0",
        "engineer_reason": "TEXT",
        "action_taken": "TEXT",
    },
    "report": {
        "share_token": "TEXT",
    },
}


def ensure_parent_dir(database_url: str) -> None:
    """Create the parent directory for the SQLite database if needed."""

    if not database_url.startswith("sqlite:///"):
        return
    db_path = Path(database_url.replace("sqlite:///", "", 1))
    db_path.parent.mkdir(parents=True, exist_ok=True)


def build_engine(database_url: str):
    """Create a SQLModel engine."""

    ensure_parent_dir(database_url)
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    return create_engine(database_url, echo=False, connect_args=connect_args)


def init_db(engine) -> None:
    """Create all database tables."""

    SQLModel.metadata.create_all(engine)
    apply_sqlite_migrations(engine)


def apply_sqlite_migrations(engine) -> None:
    """Add lightweight backward-compatible columns for existing SQLite databases."""

    if not str(engine.url).startswith("sqlite"):
        return
    with engine.begin() as connection:
        for table_name, columns in SQLITE_MIGRATIONS.items():
            rows = connection.exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()
            existing = {row[1] for row in rows}
            for column_name, column_sql in columns.items():
                if column_name in existing:
                    continue
                connection.exec_driver_sql(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_sql}")


def get_session(request: Request) -> Iterator[Session]:
    """Yield a database session from the current application state."""

    with Session(request.app.state.engine) as session:
        yield session
