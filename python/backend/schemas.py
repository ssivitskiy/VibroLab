"""Pydantic schemas for the VibroLab backend."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class UserRegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=8)
    display_name: str
    role: str = "operator"


class UserLoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=8)


class UserRead(BaseModel):
    id: str
    email: str
    display_name: str
    role: str
    created_at: datetime


class AuthSessionRead(BaseModel):
    id: str
    expires_at: datetime
    last_seen_at: datetime


class AuthPayload(BaseModel):
    user: UserRead
    session: AuthSessionRead


class AssetCreate(BaseModel):
    name: str
    asset_type: str = "gearbox"
    location: str | None = None
    description: str | None = None
    current_status: str = "monitor"


class AssetRead(BaseModel):
    id: str
    name: str
    asset_type: str
    location: str | None
    description: str | None
    current_status: str
    created_at: datetime
    updated_at: datetime


class InspectionCreate(BaseModel):
    asset_id: str | None = None
    measurement_id: str | None = None
    asset_name: str
    title: str | None = None
    state_key: str = "monitor"
    state_label: str = "Наблюдать"
    work_status: str = "observe"
    work_status_label: str = "Наблюдать"
    is_baseline: bool = False
    note: str | None = None
    engineer_reason: str | None = None
    action_taken: str | None = None
    predicted_class: str
    confidence: float = 0.0
    source_label: str = "Browser inference"
    input_type: str = "demo"
    input_label: str
    sample_rate: float = 0.0
    probabilities: dict[str, float] = Field(default_factory=dict)
    playbook: dict[str, Any] = Field(default_factory=dict)
    input_context: dict[str, Any] = Field(default_factory=dict)
    signal_data: list[float] = Field(default_factory=list)
    created_at: datetime | None = None


class InspectionUpdate(BaseModel):
    state_key: str | None = None
    state_label: str | None = None
    work_status: str | None = None
    work_status_label: str | None = None
    is_baseline: bool | None = None
    note: str | None = None
    engineer_reason: str | None = None
    action_taken: str | None = None
    title: str | None = None


class InspectionRead(BaseModel):
    id: str
    asset_id: str
    asset_name: str
    measurement_id: str | None
    title: str | None
    state_key: str
    state_label: str
    work_status: str
    work_status_label: str
    is_baseline: bool
    note: str | None
    engineer_reason: str | None
    action_taken: str | None
    predicted_class: str
    confidence: float
    source_label: str
    input_type: str
    input_label: str
    sample_rate: float
    probabilities: dict[str, float]
    playbook: dict[str, Any]
    input_context: dict[str, Any]
    signal_data: list[float]
    created_at: datetime
    updated_at: datetime


class SnapshotCreate(BaseModel):
    inspection_id: str
    label: str
    snapshot_type: str = "diagnostic_state"
    simulator_state: dict[str, Any] = Field(default_factory=dict)
    diagnosis: dict[str, Any] = Field(default_factory=dict)


class SnapshotRead(BaseModel):
    id: str
    inspection_id: str
    label: str
    snapshot_type: str
    simulator_state: dict[str, Any]
    diagnosis: dict[str, Any]
    created_at: datetime


class ReportCreate(BaseModel):
    inspection_id: str
    title: str
    report_type: str = "inspection"
    status: str = "draft"
    summary: str = ""
    recommendations: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)


class ReportRead(BaseModel):
    id: str
    inspection_id: str
    title: str
    report_type: str
    status: str
    share_token: str | None
    share_url: str | None
    summary: str
    recommendations: str
    payload: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class ImportLocalHistoryRequest(BaseModel):
    items: list[InspectionCreate] = Field(default_factory=list)


class ImportLocalHistoryResponse(BaseModel):
    imported_count: int
    asset_count: int


class DashboardSummary(BaseModel):
    inspections: int
    assets: int
    reports: int
    measurements: int = 0
    alerts_active: int = 0
    alert_events: int = 0
    latest_inspection_at: datetime | None = None


class MeasurementUploadRequest(BaseModel):
    asset_id: str | None = None
    asset_name: str
    source_kind: str = "uploaded_file"
    source_label: str = "Real monitoring"
    input_label: str
    original_name: str
    mime_type: str | None = None
    content_base64: str
    sample_rate: float = 0.0
    sample_count: int = 0
    duration_seconds: float = 0.0
    predicted_class: str | None = None
    confidence: float = 0.0
    probabilities: dict[str, float] = Field(default_factory=dict)
    input_context: dict[str, Any] = Field(default_factory=dict)
    preview_signal: list[float] = Field(default_factory=list)
    note: str | None = None


class MeasurementRead(BaseModel):
    id: str
    asset_id: str
    asset_name: str
    inspection_id: str | None
    source_kind: str
    source_label: str
    input_label: str
    original_name: str
    file_ext: str | None
    mime_type: str | None
    storage_size: int
    sample_rate: float
    sample_count: int
    duration_seconds: float
    predicted_class: str | None
    confidence: float
    probabilities: dict[str, float]
    input_context: dict[str, Any]
    preview_signal: list[float]
    note: str | None
    download_url: str
    created_at: datetime
    updated_at: datetime


class AlertRead(BaseModel):
    id: str
    asset_id: str
    asset_name: str
    inspection_id: str | None
    measurement_id: str | None
    alert_type: str
    severity: str
    status: str
    title: str
    summary: str
    recommended_action: str
    current_class: str | None
    current_confidence: float
    events_count: int = 0
    last_event_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class AlertEventCreate(BaseModel):
    event_type: str = "note"
    next_status: str | None = None
    message: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class AlertEventRead(BaseModel):
    id: str
    alert_id: str
    inspection_id: str | None
    event_type: str
    from_status: str | None
    to_status: str | None
    message: str
    metadata: dict[str, Any]
    author_name: str
    created_at: datetime
