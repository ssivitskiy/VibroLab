"""Database models for the VibroLab backend."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import Column, Text
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    """Naive UTC timestamp for SQLite compatibility."""

    return datetime.now(UTC).replace(tzinfo=None)


def new_id() -> str:
    """Generate a compact string primary key."""

    return uuid.uuid4().hex


class User(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    email: str = Field(index=True, sa_column_kwargs={"unique": True})
    display_name: str
    role: str = Field(default="operator")
    password_hash: str
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class UserSession(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    user_id: str = Field(index=True, foreign_key="user.id")
    token_hash: str
    user_agent: str | None = None
    expires_at: datetime
    created_at: datetime = Field(default_factory=utcnow)
    last_seen_at: datetime = Field(default_factory=utcnow)


class Asset(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    owner_id: str = Field(index=True, foreign_key="user.id")
    name: str = Field(index=True)
    asset_type: str = Field(default="gearbox")
    location: str | None = None
    description: str | None = None
    current_status: str = Field(default="monitor")
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Inspection(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    user_id: str = Field(index=True, foreign_key="user.id")
    asset_id: str = Field(index=True, foreign_key="asset.id")
    measurement_id: str | None = Field(default=None, index=True, foreign_key="measurement.id")
    title: str | None = None
    input_type: str = Field(default="demo")
    input_label: str
    predicted_class: str
    confidence: float = Field(default=0.0)
    state_key: str = Field(default="monitor")
    state_label: str = Field(default="Наблюдать")
    work_status: str = Field(default="observe")
    work_status_label: str = Field(default="Наблюдать")
    is_baseline: bool = Field(default=False)
    note: str | None = None
    engineer_reason: str | None = None
    action_taken: str | None = None
    source_label: str = Field(default="Browser inference")
    sample_rate: float = Field(default=0.0)
    probabilities_json: str = Field(default="{}", sa_column=Column(Text, nullable=False))
    playbook_json: str = Field(default="{}", sa_column=Column(Text, nullable=False))
    input_json: str = Field(default="{}", sa_column=Column(Text, nullable=False))
    signal_data_json: str = Field(default="[]", sa_column=Column(Text, nullable=False))
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Measurement(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    user_id: str = Field(index=True, foreign_key="user.id")
    asset_id: str = Field(index=True, foreign_key="asset.id")
    inspection_id: str | None = Field(default=None, index=True, foreign_key="inspection.id")
    source_kind: str = Field(default="uploaded_file")
    source_label: str = Field(default="Real monitoring")
    original_name: str
    stored_name: str
    file_ext: str | None = None
    mime_type: str | None = None
    storage_path: str
    storage_size: int = Field(default=0)
    input_label: str
    predicted_class: str | None = None
    confidence: float = Field(default=0.0)
    sample_rate: float = Field(default=0.0)
    sample_count: int = Field(default=0)
    duration_seconds: float = Field(default=0.0)
    note: str | None = None
    probabilities_json: str = Field(default="{}", sa_column=Column(Text, nullable=False))
    input_json: str = Field(default="{}", sa_column=Column(Text, nullable=False))
    preview_signal_json: str = Field(default="[]", sa_column=Column(Text, nullable=False))
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Snapshot(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    inspection_id: str = Field(index=True, foreign_key="inspection.id")
    user_id: str = Field(index=True, foreign_key="user.id")
    label: str
    snapshot_type: str = Field(default="diagnostic_state")
    simulator_state_json: str = Field(default="{}", sa_column=Column(Text, nullable=False))
    diagnosis_json: str = Field(default="{}", sa_column=Column(Text, nullable=False))
    created_at: datetime = Field(default_factory=utcnow)


class Report(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    inspection_id: str = Field(index=True, foreign_key="inspection.id")
    user_id: str = Field(index=True, foreign_key="user.id")
    title: str
    report_type: str = Field(default="inspection")
    status: str = Field(default="draft")
    share_token: str | None = Field(default=None, index=True)
    summary: str = Field(default="")
    recommendations: str = Field(default="")
    payload_json: str = Field(default="{}", sa_column=Column(Text, nullable=False))
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Alert(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    user_id: str = Field(index=True, foreign_key="user.id")
    asset_id: str = Field(index=True, foreign_key="asset.id")
    inspection_id: str | None = Field(default=None, index=True, foreign_key="inspection.id")
    measurement_id: str | None = Field(default=None, index=True, foreign_key="measurement.id")
    alert_type: str = Field(default="diagnostic")
    severity: str = Field(default="medium")
    status: str = Field(default="new")
    title: str
    summary: str = Field(default="")
    recommended_action: str = Field(default="")
    current_class: str | None = None
    current_confidence: float = Field(default=0.0)
    last_event_at: datetime = Field(default_factory=utcnow)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class AlertEvent(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    alert_id: str = Field(index=True, foreign_key="alert.id")
    user_id: str = Field(index=True, foreign_key="user.id")
    inspection_id: str | None = Field(default=None, index=True, foreign_key="inspection.id")
    event_type: str = Field(default="note")
    from_status: str | None = None
    to_status: str | None = None
    message: str = Field(default="")
    metadata_json: str = Field(default="{}", sa_column=Column(Text, nullable=False))
    created_at: datetime = Field(default_factory=utcnow)
