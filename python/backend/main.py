"""FastAPI app for user accounts and diagnostic history."""

from __future__ import annotations

import base64
import binascii
from html import escape
import json
from datetime import timedelta
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from sqlmodel import Session, select

from backend.config import BASE_DIR, RUNTIME_DIR, get_settings
from backend.db import build_engine, get_session, init_db
from backend.models import Alert, AlertEvent, Asset, Inspection, Measurement, Report, Snapshot, User, UserSession, new_id, utcnow
from backend.schemas import (
    AlertEventCreate,
    AlertEventRead,
    AlertRead,
    AssetCreate,
    AssetRead,
    AuthPayload,
    AuthSessionRead,
    DashboardSummary,
    ImportLocalHistoryRequest,
    ImportLocalHistoryResponse,
    InspectionCreate,
    InspectionRead,
    InspectionUpdate,
    MeasurementRead,
    MeasurementUploadRequest,
    ReportCreate,
    ReportRead,
    SnapshotCreate,
    SnapshotRead,
    UserLoginRequest,
    UserRead,
    UserRegisterRequest,
)
from backend.security import generate_session_token, hash_password, hash_session_token, verify_password


settings = get_settings()
api = APIRouter()
STATE_LABELS = {
    "healthy": "Healthy",
    "baseline": "Эталон",
    "warning": "Warning",
    "monitor": "Наблюдать",
    "inspect": "Проверить",
    "service": "Service",
    "critical": "Критично",
    "after_maintenance": "After maintenance",
}
WORK_STATUS_LABELS = {
    "observe": "Наблюдать",
    "inspect": "Проверить",
    "repair": "Ремонт",
    "replaced": "Заменено",
}
ALERT_STATUS_FLOW = {"new", "acknowledged", "in_progress", "resolved"}
ALERT_SEVERITY_ORDER = {"low": 1, "medium": 2, "high": 3, "critical": 4}


def dumps_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def loads_json(value: str, fallback: Any) -> Any:
    try:
        return json.loads(value) if value else fallback
    except json.JSONDecodeError:
        return fallback


def resolve_state_label(key: str, fallback: str | None = None) -> str:
    return fallback or STATE_LABELS.get((key or "").strip(), "Наблюдать")


def resolve_work_status_label(key: str, fallback: str | None = None) -> str:
    return fallback or WORK_STATUS_LABELS.get((key or "").strip(), "Наблюдать")


def build_share_url(share_token: str | None) -> str | None:
    return build_public_path(f"/shared/reports/{share_token}") if share_token else None


def build_measurement_download_url(measurement_id: str) -> str:
    return build_public_path(f"/api/measurements/{measurement_id}/download")


def build_public_path(path: str) -> str:
    normalized = path if path.startswith("/") else f"/{path}"
    base_path = settings.public_base_path
    if normalized == "/" and base_path:
        return f"{base_path}/"
    if base_path and not normalized.startswith(f"{base_path}/") and normalized != base_path:
        return f"{base_path}{normalized}"
    return normalized


def build_route_variants(path: str) -> list[str]:
    normalized = path if path.startswith("/") else f"/{path}"
    variants = [normalized]
    base_path = settings.public_base_path
    if base_path:
        if normalized == "/":
            variants.extend([base_path, f"{base_path}/"])
        else:
            variants.append(f"{base_path}{normalized}")
    deduped: list[str] = []
    for variant in variants:
        if variant not in deduped:
            deduped.append(variant)
    return deduped


def resolve_web_target(web_dir: Path, file_path: str) -> Path | None:
    normalized = file_path.lstrip("/")
    base_prefix = settings.public_base_path.strip("/")
    if base_prefix and (normalized == base_prefix or normalized.startswith(f"{base_prefix}/")):
        normalized = normalized[len(base_prefix):].lstrip("/")
    candidate = (web_dir / normalized).resolve()
    try:
        candidate.relative_to(web_dir.resolve())
    except ValueError:
        return None
    return candidate


def serialize_user(user: User) -> UserRead:
    return UserRead(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        created_at=user.created_at,
    )


def serialize_asset(asset: Asset) -> AssetRead:
    return AssetRead(
        id=asset.id,
        name=asset.name,
        asset_type=asset.asset_type,
        location=asset.location,
        description=asset.description,
        current_status=asset.current_status,
        created_at=asset.created_at,
        updated_at=asset.updated_at,
    )


def serialize_inspection(inspection: Inspection, asset: Asset) -> InspectionRead:
    return InspectionRead(
        id=inspection.id,
        asset_id=inspection.asset_id,
        asset_name=asset.name,
        measurement_id=inspection.measurement_id,
        title=inspection.title,
        state_key=inspection.state_key,
        state_label=inspection.state_label,
        work_status=inspection.work_status,
        work_status_label=inspection.work_status_label,
        is_baseline=inspection.is_baseline,
        note=inspection.note,
        engineer_reason=inspection.engineer_reason,
        action_taken=inspection.action_taken,
        predicted_class=inspection.predicted_class,
        confidence=inspection.confidence,
        source_label=inspection.source_label,
        input_type=inspection.input_type,
        input_label=inspection.input_label,
        sample_rate=inspection.sample_rate,
        probabilities=loads_json(inspection.probabilities_json, {}),
        playbook=loads_json(inspection.playbook_json, {}),
        input_context=loads_json(inspection.input_json, {}),
        signal_data=loads_json(inspection.signal_data_json, []),
        created_at=inspection.created_at,
        updated_at=inspection.updated_at,
    )


def serialize_measurement(measurement: Measurement, asset: Asset) -> MeasurementRead:
    return MeasurementRead(
        id=measurement.id,
        asset_id=measurement.asset_id,
        asset_name=asset.name,
        inspection_id=measurement.inspection_id,
        source_kind=measurement.source_kind,
        source_label=measurement.source_label,
        input_label=measurement.input_label,
        original_name=measurement.original_name,
        file_ext=measurement.file_ext,
        mime_type=measurement.mime_type,
        storage_size=measurement.storage_size,
        sample_rate=measurement.sample_rate,
        sample_count=measurement.sample_count,
        duration_seconds=measurement.duration_seconds,
        predicted_class=measurement.predicted_class,
        confidence=measurement.confidence,
        probabilities=loads_json(measurement.probabilities_json, {}),
        input_context=loads_json(measurement.input_json, {}),
        preview_signal=loads_json(measurement.preview_signal_json, []),
        note=measurement.note,
        download_url=build_measurement_download_url(measurement.id),
        created_at=measurement.created_at,
        updated_at=measurement.updated_at,
    )


def serialize_snapshot(snapshot: Snapshot) -> SnapshotRead:
    return SnapshotRead(
        id=snapshot.id,
        inspection_id=snapshot.inspection_id,
        label=snapshot.label,
        snapshot_type=snapshot.snapshot_type,
        simulator_state=loads_json(snapshot.simulator_state_json, {}),
        diagnosis=loads_json(snapshot.diagnosis_json, {}),
        created_at=snapshot.created_at,
    )


def serialize_report(report: Report) -> ReportRead:
    return ReportRead(
        id=report.id,
        inspection_id=report.inspection_id,
        title=report.title,
        report_type=report.report_type,
        status=report.status,
        share_token=report.share_token,
        share_url=build_share_url(report.share_token),
        summary=report.summary,
        recommendations=report.recommendations,
        payload=loads_json(report.payload_json, {}),
        created_at=report.created_at,
        updated_at=report.updated_at,
    )


def serialize_alert(alert: Alert, asset: Asset, events_count: int = 0) -> AlertRead:
    return AlertRead(
        id=alert.id,
        asset_id=alert.asset_id,
        asset_name=asset.name,
        inspection_id=alert.inspection_id,
        measurement_id=alert.measurement_id,
        alert_type=alert.alert_type,
        severity=alert.severity,
        status=alert.status,
        title=alert.title,
        summary=alert.summary,
        recommended_action=alert.recommended_action,
        current_class=alert.current_class,
        current_confidence=alert.current_confidence,
        events_count=events_count,
        last_event_at=alert.last_event_at,
        created_at=alert.created_at,
        updated_at=alert.updated_at,
    )


def serialize_alert_event(event: AlertEvent, author: User | None) -> AlertEventRead:
    return AlertEventRead(
        id=event.id,
        alert_id=event.alert_id,
        inspection_id=event.inspection_id,
        event_type=event.event_type,
        from_status=event.from_status,
        to_status=event.to_status,
        message=event.message,
        metadata=loads_json(event.metadata_json, {}),
        author_name=author.display_name if author else "Unknown user",
        created_at=event.created_at,
    )


def inspection_requires_alert(inspection: Inspection) -> bool:
    if inspection.predicted_class != "normal":
        return True
    if inspection.state_key in {"warning", "service", "critical"}:
        return True
    return inspection.work_status in {"inspect", "repair"}


def infer_alert_severity(inspection: Inspection) -> str:
    if inspection.work_status == "repair" or inspection.state_key == "service":
        return "high"
    if inspection.predicted_class in {"tooth_miss", "root_crack", "combination"}:
        return "critical"
    if inspection.predicted_class in {"inner_race", "tooth_chip"}:
        return "high"
    if inspection.predicted_class in {"surface_wear", "outer_race", "ball_fault"}:
        return "medium"
    return "low"


def infer_alert_status_from_inspection(inspection: Inspection, current_status: str | None = None) -> str:
    if inspection.predicted_class == "normal" and inspection.state_key == "after_maintenance":
        return "resolved"
    if inspection.work_status == "replaced":
        return "resolved"
    if inspection.work_status == "repair" or inspection.state_key == "service":
        return "in_progress"
    if current_status in {"acknowledged", "in_progress"}:
        return current_status
    return "new"


def get_active_alert_for_asset(session: Session, user_id: str, asset_id: str) -> Alert | None:
    statement = (
        select(Alert)
        .where(
            Alert.user_id == user_id,
            Alert.asset_id == asset_id,
            Alert.status != "resolved",
        )
        .order_by(Alert.updated_at.desc())
    )
    return session.exec(statement).first()


def get_latest_alert_for_inspection(session: Session, user_id: str, inspection_id: str) -> Alert | None:
    statement = (
        select(Alert)
        .where(Alert.user_id == user_id, Alert.inspection_id == inspection_id)
        .order_by(Alert.updated_at.desc())
    )
    return session.exec(statement).first()


def list_alert_events(session: Session, user_id: str, alert_id: str) -> list[AlertEvent]:
    statement = (
        select(AlertEvent)
        .join(Alert, Alert.id == AlertEvent.alert_id)
        .where(Alert.user_id == user_id, AlertEvent.alert_id == alert_id)
        .order_by(AlertEvent.created_at.desc())
    )
    return session.exec(statement).all()


def build_alert_message(inspection: Inspection, asset: Asset) -> tuple[str, str, str]:
    playbook = loads_json(inspection.playbook_json, {})
    diagnosis_label = inspection.predicted_class
    title = f"{asset.name} · {diagnosis_label}"
    summary = (
        inspection.engineer_reason
        or inspection.note
        or f"{diagnosis_label} · состояние {inspection.state_label} · статус {inspection.work_status_label}"
    )
    recommended_action = (
        inspection.action_taken
        or playbook.get("action")
        or playbook.get("priority")
        or "Требуется инженерное подтверждение следующего шага."
    )
    return title, summary, recommended_action


def create_alert_event(
    session: Session,
    *,
    alert: Alert,
    user: User,
    event_type: str,
    message: str,
    inspection_id: str | None = None,
    next_status: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> AlertEvent:
    from_status = alert.status
    normalized_status = next_status if next_status in ALERT_STATUS_FLOW else None
    if normalized_status:
        alert.status = normalized_status
    now = utcnow()
    alert.last_event_at = now
    alert.updated_at = now
    event = AlertEvent(
        alert_id=alert.id,
        user_id=user.id,
        inspection_id=inspection_id,
        event_type=event_type,
        from_status=None if event_type == "created" else from_status,
        to_status=alert.status if normalized_status or event_type == "created" else None,
        message=message,
        metadata_json=dumps_json(metadata or {}),
        created_at=now,
    )
    session.add(alert)
    session.add(event)
    return event


def sync_alert_for_inspection(session: Session, user: User, asset: Asset, inspection: Inspection) -> Alert | None:
    active_alert = get_active_alert_for_asset(session, user.id, asset.id)
    desired_status = infer_alert_status_from_inspection(inspection, active_alert.status if active_alert else None)
    title, summary, recommended_action = build_alert_message(inspection, asset)

    if not inspection_requires_alert(inspection):
        if active_alert and desired_status == "resolved" and active_alert.status != "resolved":
            active_alert.title = title
            active_alert.summary = summary
            active_alert.recommended_action = recommended_action
            active_alert.inspection_id = inspection.id
            active_alert.measurement_id = inspection.measurement_id
            active_alert.current_class = inspection.predicted_class
            active_alert.current_confidence = inspection.confidence
            active_alert.severity = infer_alert_severity(inspection)
            create_alert_event(
                session,
                alert=active_alert,
                user=user,
                event_type="inspection_sync",
                message="Контрольная запись after maintenance завершила alert-цикл.",
                inspection_id=inspection.id,
                next_status="resolved",
                metadata={"source": "inspection_sync"},
            )
        return active_alert

    severity = infer_alert_severity(inspection)
    if active_alert:
        previous_inspection_id = active_alert.inspection_id
        active_alert.inspection_id = inspection.id
        active_alert.measurement_id = inspection.measurement_id
        active_alert.title = title
        active_alert.summary = summary
        active_alert.recommended_action = recommended_action
        active_alert.current_class = inspection.predicted_class
        active_alert.current_confidence = inspection.confidence
        active_alert.severity = severity
        status_changed = desired_status != active_alert.status
        inspection_changed = previous_inspection_id != inspection.id
        if status_changed or inspection_changed:
            create_alert_event(
                session,
                alert=active_alert,
                user=user,
                event_type="inspection_sync",
                message=f"Alert синхронизирован с новой диагностической записью: {inspection.predicted_class}.",
                inspection_id=inspection.id,
                next_status=desired_status,
                metadata={"source": "inspection_sync"},
            )
        else:
            active_alert.updated_at = utcnow()
            active_alert.last_event_at = active_alert.last_event_at or active_alert.updated_at
            session.add(active_alert)
        return active_alert

    latest_for_inspection = get_latest_alert_for_inspection(session, user.id, inspection.id)
    if latest_for_inspection and latest_for_inspection.status == "resolved":
        return latest_for_inspection

    alert = Alert(
        user_id=user.id,
        asset_id=asset.id,
        inspection_id=inspection.id,
        measurement_id=inspection.measurement_id,
        alert_type="diagnostic",
        severity=severity,
        status=desired_status,
        title=title,
        summary=summary,
        recommended_action=recommended_action,
        current_class=inspection.predicted_class,
        current_confidence=inspection.confidence,
        last_event_at=inspection.updated_at or inspection.created_at,
    )
    session.add(alert)
    session.flush()
    create_alert_event(
        session,
        alert=alert,
        user=user,
        event_type="created",
        message=f"Создан alert по диагностике {inspection.predicted_class}.",
        inspection_id=inspection.id,
        metadata={"source": "inspection_create"},
    )
    return alert


def ensure_alerts_for_user(session: Session, user: User) -> None:
    assets = session.exec(select(Asset).where(Asset.owner_id == user.id)).all()
    for asset in assets:
        latest = (
            session.exec(
                select(Inspection)
                .where(Inspection.user_id == user.id, Inspection.asset_id == asset.id)
                .order_by(Inspection.created_at.desc())
            ).first()
        )
        if not latest:
            continue
        sync_alert_for_inspection(session, user, asset, latest)


def set_session_cookie(response: Response, session_row: UserSession, raw_token: str) -> None:
    cookie_value = f"{session_row.id}.{raw_token}"
    response.set_cookie(
        settings.session_cookie_name,
        cookie_value,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        max_age=settings.session_ttl_days * 24 * 60 * 60,
        expires=int((utcnow() + timedelta(days=settings.session_ttl_days)).timestamp()),
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(settings.session_cookie_name, httponly=True, samesite="lax")


def get_current_auth(request: Request, session: Session = Depends(get_session)) -> tuple[User, UserSession]:
    cookie_value = request.cookies.get(settings.session_cookie_name)
    if not cookie_value or "." not in cookie_value:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    session_id, raw_token = cookie_value.split(".", 1)
    session_row = session.get(UserSession, session_id)
    if not session_row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session not found")
    if session_row.expires_at <= utcnow():
        session.delete(session_row)
        session.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")
    if session_row.token_hash != hash_session_token(raw_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session token")

    user = session.get(User, session_row.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User is not active")

    session_row.last_seen_at = utcnow()
    session.add(session_row)
    session.commit()
    session.refresh(session_row)
    return user, session_row


def get_asset_by_name(session: Session, owner_id: str, name: str) -> Asset | None:
    statement = select(Asset).where(Asset.owner_id == owner_id, Asset.name == name)
    return session.exec(statement).first()


def get_or_create_asset(
    session: Session,
    owner_id: str,
    name: str,
    asset_type: str = "gearbox",
    current_status: str = "monitor",
) -> Asset:
    asset = get_asset_by_name(session, owner_id, name)
    if asset:
        asset.current_status = current_status or asset.current_status
        asset.updated_at = utcnow()
        session.add(asset)
        session.commit()
        session.refresh(asset)
        return asset

    asset = Asset(owner_id=owner_id, name=name, asset_type=asset_type, current_status=current_status)
    session.add(asset)
    session.commit()
    session.refresh(asset)
    return asset


def get_report_for_inspection(session: Session, user_id: str, inspection_id: str) -> Report | None:
    statement = select(Report).where(Report.user_id == user_id, Report.inspection_id == inspection_id)
    return session.exec(statement).first()


def list_measurements(session: Session, user_id: str, asset_id: str | None = None) -> list[Measurement]:
    statement = select(Measurement).where(Measurement.user_id == user_id)
    if asset_id:
        statement = statement.where(Measurement.asset_id == asset_id)
    statement = statement.order_by(Measurement.created_at.desc())
    return session.exec(statement).all()


def sanitize_filename(name: str) -> str:
    raw = Path(name or "signal.dat").name
    safe = "".join(ch if ch.isalnum() or ch in {"-", "_", "."} else "_" for ch in raw)
    return safe or "signal.dat"


def measurement_storage_path(user_id: str, measurement_id: str, original_name: str) -> tuple[Path, str]:
    safe_name = sanitize_filename(original_name)
    stored_name = f"{measurement_id}_{safe_name}"
    path = RUNTIME_DIR / "uploads" / user_id / stored_name
    path.parent.mkdir(parents=True, exist_ok=True)
    return path, stored_name


def list_asset_inspections(session: Session, user_id: str, asset_id: str) -> list[Inspection]:
    statement = (
        select(Inspection)
        .where(Inspection.user_id == user_id, Inspection.asset_id == asset_id)
        .order_by(Inspection.created_at.desc())
    )
    return session.exec(statement).all()


def get_baseline_inspection(session: Session, user_id: str, asset_id: str) -> Inspection | None:
    statement = (
        select(Inspection)
        .where(
            Inspection.user_id == user_id,
            Inspection.asset_id == asset_id,
            Inspection.is_baseline == True,  # noqa: E712 - SQL expression
        )
        .order_by(Inspection.updated_at.desc(), Inspection.created_at.desc())
    )
    return session.exec(statement).first()


def clear_asset_baseline(session: Session, user_id: str, asset_id: str, exclude_inspection_id: str | None = None) -> None:
    statement = select(Inspection).where(
        Inspection.user_id == user_id,
        Inspection.asset_id == asset_id,
        Inspection.is_baseline == True,  # noqa: E712 - SQL expression
    )
    for row in session.exec(statement).all():
        if exclude_inspection_id and row.id == exclude_inspection_id:
            continue
        row.is_baseline = False
        row.updated_at = utcnow()
        session.add(row)


def should_auto_mark_baseline(session: Session, user_id: str, asset_id: str, payload: InspectionCreate) -> bool:
    if get_baseline_inspection(session, user_id, asset_id):
        return False
    normalized_state = (payload.state_key or "").strip()
    return normalized_state in {"healthy", "after_maintenance"} and payload.predicted_class == "normal"


def signal_metrics(signal_data: list[float]) -> dict[str, float]:
    if not signal_data:
        return {"rms": 0.0, "peak": 0.0}
    rms = (sum(value * value for value in signal_data) / len(signal_data)) ** 0.5
    peak = max(abs(value) for value in signal_data)
    return {"rms": rms, "peak": peak}


def build_report_fields(session: Session, inspection: Inspection, asset: Asset) -> dict[str, Any]:
    probabilities = loads_json(inspection.probabilities_json, {})
    playbook = loads_json(inspection.playbook_json, {})
    input_context = loads_json(inspection.input_json, {})
    signal_data = loads_json(inspection.signal_data_json, [])
    current_metrics = signal_metrics(signal_data)
    measurement = session.get(Measurement, inspection.measurement_id) if inspection.measurement_id else None
    history = list_asset_inspections(session, inspection.user_id, asset.id)
    baseline = get_baseline_inspection(session, inspection.user_id, asset.id)
    if not baseline:
        ascending = list(reversed(history))
        baseline = next(
            (
                row
                for row in ascending
                if row.predicted_class == "normal" or row.state_key in {"healthy", "after_maintenance"}
            ),
            None,
        )

    title = inspection.title or f"{asset.name} · {inspection.input_label}"
    summary_parts = [
        f"Объект: {asset.name}.",
        f"Последний диагноз: {inspection.predicted_class} с уверенностью {inspection.confidence * 100:.1f}%.",
        f"Стадия состояния: {inspection.state_label}.",
        f"Рабочий статус: {inspection.work_status_label}.",
    ]
    comparison_payload: dict[str, Any] | None = None
    baseline_payload: dict[str, Any] | None = None
    if baseline:
        baseline_signal = loads_json(baseline.signal_data_json, [])
        baseline_metrics = signal_metrics(baseline_signal)
        baseline_payload = {
            **serialize_inspection(baseline, asset).model_dump(mode="json"),
            "metrics": baseline_metrics,
        }
        if baseline.id == inspection.id:
            summary_parts.append("Этот сеанс зафиксирован как текущий baseline объекта.")
        else:
            rms_delta_pct = (
                ((current_metrics["rms"] - baseline_metrics["rms"]) / baseline_metrics["rms"]) * 100
                if baseline_metrics["rms"]
                else None
            )
            peak_delta_pct = (
                ((current_metrics["peak"] - baseline_metrics["peak"]) / baseline_metrics["peak"]) * 100
                if baseline_metrics["peak"]
                else None
            )
            comparison_payload = {
                "baseline_id": baseline.id,
                "target_id": inspection.id,
                "baseline_label": baseline.input_label,
                "target_label": inspection.input_label,
                "baseline_class": baseline.predicted_class,
                "target_class": inspection.predicted_class,
                "baseline_confidence": baseline.confidence,
                "target_confidence": inspection.confidence,
                "baseline_metrics": baseline_metrics,
                "target_metrics": current_metrics,
                "confidence_delta_pct": (inspection.confidence - baseline.confidence) * 100,
                "rms_delta_pct": rms_delta_pct,
                "peak_delta_pct": peak_delta_pct,
            }
            summary_parts.append(
                f"Сравнение выполнено относительно baseline от {baseline.created_at.isoformat(timespec='minutes')}."
            )
            if rms_delta_pct is not None:
                summary_parts.append(f"RMS изменился на {rms_delta_pct:+.1f}% относительно эталона.")

    stage_route: list[str] = []
    for row in reversed(history):
        state_label = row.state_label or resolve_state_label(row.state_key)
        if not stage_route or stage_route[-1] != state_label:
            stage_route.append(state_label)
    if stage_route:
        summary_parts.append(f"Маршрут объекта: {' → '.join(stage_route)}.")
    if inspection.engineer_reason:
        summary_parts.append(f"Инженерное обоснование: {inspection.engineer_reason}")
    recommendations = inspection.action_taken or playbook.get("action") or playbook.get("priority") or "Требуется инженерная оценка."
    payload = {
        "asset": serialize_asset(asset).model_dump(mode="json"),
        "inspection": serialize_inspection(inspection, asset).model_dump(mode="json"),
        "measurement": serialize_measurement(measurement, asset).model_dump(mode="json") if measurement else None,
        "generated_at": utcnow().isoformat(),
        "signal_samples": len(signal_data),
        "current_metrics": current_metrics,
        "input_context": input_context,
        "probabilities": probabilities,
        "playbook": playbook,
        "baseline": baseline_payload,
        "comparison": comparison_payload,
        "lifecycle_route": stage_route,
        "history": [
            {
                "id": row.id,
                "created_at": row.created_at.isoformat(),
                "state_label": row.state_label,
                "work_status_label": row.work_status_label,
                "predicted_class": row.predicted_class,
                "confidence": row.confidence,
                "is_baseline": row.is_baseline,
            }
            for row in history[:6]
        ],
    }
    return {
        "title": f"Отчёт · {title}",
        "status": "published",
        "summary": " ".join(part.strip() for part in summary_parts if part),
        "recommendations": recommendations,
        "payload": payload,
    }


def render_public_report(report: Report, inspection: Inspection, asset: Asset) -> str:
    payload = loads_json(report.payload_json, {})
    probabilities = payload.get("probabilities") or loads_json(inspection.probabilities_json, {})
    baseline = payload.get("baseline") or None
    comparison = payload.get("comparison") or None
    measurement = payload.get("measurement") or None
    history = payload.get("history") or []
    lifecycle_route = payload.get("lifecycle_route") or []
    current_metrics = payload.get("current_metrics") or {"rms": 0.0, "peak": 0.0}
    rows = "".join(
        f"<tr><td>{escape(label)}</td><td>{value * 100:.1f}%</td></tr>"
        for label, value in sorted(probabilities.items(), key=lambda item: item[1], reverse=True)[:5]
    ) or "<tr><td colspan='2'>Нет данных вероятностей</td></tr>"
    baseline_html = ""
    if baseline:
        baseline_html = f"""
    <div class="card">
      <div class="eyebrow">Baseline объекта</div>
      <div class="grid">
        <div class="metric"><div class="eyebrow">Сеанс</div><strong>{escape(baseline.get('input_label') or baseline.get('title') or 'Baseline')}</strong></div>
        <div class="metric"><div class="eyebrow">Класс</div><strong>{escape(baseline.get('predicted_class') or '—')}</strong></div>
        <div class="metric"><div class="eyebrow">Уверенность</div><strong>{baseline.get('confidence', 0) * 100:.1f}%</strong></div>
        <div class="metric"><div class="eyebrow">RMS / Peak</div><strong>{baseline.get('metrics', {}).get('rms', 0):.3f} / {baseline.get('metrics', {}).get('peak', 0):.3f}</strong></div>
      </div>
    </div>
"""
    comparison_html = ""
    if comparison:
        rms_delta = comparison.get("rms_delta_pct")
        peak_delta = comparison.get("peak_delta_pct")
        comparison_html = f"""
    <div class="card">
      <div class="eyebrow">Сравнение с baseline</div>
      <div class="grid">
        <div class="metric"><div class="eyebrow">Диагноз</div><strong>{escape(comparison.get('baseline_class') or '—')} → {escape(comparison.get('target_class') or '—')}</strong></div>
        <div class="metric"><div class="eyebrow">Confidence</div><strong>{comparison.get('baseline_confidence', 0) * 100:.1f}% → {comparison.get('target_confidence', 0) * 100:.1f}%</strong></div>
        <div class="metric"><div class="eyebrow">RMS</div><strong>{comparison.get('baseline_metrics', {}).get('rms', 0):.3f} → {comparison.get('target_metrics', {}).get('rms', 0):.3f}</strong></div>
        <div class="metric"><div class="eyebrow">Peak</div><strong>{comparison.get('baseline_metrics', {}).get('peak', 0):.3f} → {comparison.get('target_metrics', {}).get('peak', 0):.3f}</strong></div>
      </div>
      <p style="line-height:1.8;margin-top:16px">RMS: {f'{rms_delta:+.1f}%' if rms_delta is not None else 'n/a'} · Peak: {f'{peak_delta:+.1f}%' if peak_delta is not None else 'n/a'}</p>
    </div>
"""
    measurement_html = ""
    if measurement:
        measurement_html = f"""
    <div class="card">
      <div class="eyebrow">Исходное измерение</div>
      <div class="grid">
        <div class="metric"><div class="eyebrow">Файл</div><strong>{escape(measurement.get('original_name') or '—')}</strong></div>
        <div class="metric"><div class="eyebrow">Тип</div><strong>{escape(measurement.get('source_kind') or 'uploaded_file')}</strong></div>
        <div class="metric"><div class="eyebrow">Длительность</div><strong>{measurement.get('duration_seconds', 0):.3f} c</strong></div>
        <div class="metric"><div class="eyebrow">Отсчёты / Fs</div><strong>{measurement.get('sample_count', 0)} · {measurement.get('sample_rate', 0):.0f} Hz</strong></div>
      </div>
    </div>
"""
    history_rows = "".join(
        f"<tr><td>{escape(item.get('created_at') or '—')}</td><td>{escape(item.get('state_label') or '—')}</td><td>{escape(item.get('work_status_label') or '—')}</td><td>{escape(item.get('predicted_class') or '—')}</td><td>{item.get('confidence', 0) * 100:.1f}%{' · baseline' if item.get('is_baseline') else ''}</td></tr>"
        for item in history
    ) or "<tr><td colspan='5'>История объекта пока не накоплена</td></tr>"
    share_url = build_share_url(report.share_token) or "#"
    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{escape(report.title)}</title>
  <style>
    :root {{ color-scheme: dark; }}
    body {{ margin:0; font-family:Arial,sans-serif; background:#0b1220; color:#eef4ff; }}
    .page {{ max-width:960px; margin:0 auto; padding:48px 24px 64px; }}
    .hero {{ display:flex; justify-content:space-between; gap:24px; align-items:flex-start; flex-wrap:wrap; }}
    .card {{ margin-top:18px; border:1px solid rgba(255,255,255,0.12); border-radius:22px; padding:20px; background:rgba(255,255,255,0.04); }}
    .eyebrow {{ font-size:12px; letter-spacing:1.5px; text-transform:uppercase; color:#8aa0ba; }}
    h1 {{ margin:8px 0 0; font-size:34px; line-height:1.15; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:14px; margin-top:18px; }}
    .metric {{ border:1px solid rgba(255,255,255,0.08); border-radius:18px; padding:16px; background:rgba(255,255,255,0.03); }}
    .metric strong {{ display:block; margin-top:8px; font-size:18px; }}
    table {{ width:100%; border-collapse:collapse; margin-top:14px; }}
    td {{ border-top:1px solid rgba(255,255,255,0.08); padding:10px 0; color:#d2dceb; }}
    .actions {{ display:flex; gap:12px; flex-wrap:wrap; margin-top:24px; }}
    .btn {{ display:inline-flex; align-items:center; justify-content:center; min-height:44px; padding:0 18px; border-radius:999px; text-decoration:none; color:#07111b; background:#6ee7f9; font-weight:700; }}
    .btn-secondary {{ background:rgba(255,255,255,0.08); color:#eef4ff; }}
    @media print {{ .actions {{ display:none; }} body {{ background:#fff; color:#000; }} .card,.metric {{ background:#fff; border-color:#ddd; }} }}
  </style>
</head>
<body>
  <div class="page">
    <div class="hero">
      <div>
        <div class="eyebrow">VibroLab Report</div>
        <h1>{escape(report.title)}</h1>
        <div style="margin-top:10px;color:#9cb0c7">Объект: {escape(asset.name)} · {escape(inspection.state_label)} · {escape(inspection.work_status_label)}</div>
      </div>
      <div class="actions">
        <button class="btn" onclick="window.print()">Печать / PDF</button>
        <a class="btn btn-secondary" href="{escape(share_url)}">Share link</a>
      </div>
    </div>

    <div class="grid">
      <div class="metric"><div class="eyebrow">Последний диагноз</div><strong>{escape(inspection.predicted_class)}</strong></div>
      <div class="metric"><div class="eyebrow">Уверенность</div><strong>{inspection.confidence * 100:.1f}%</strong></div>
      <div class="metric"><div class="eyebrow">Стадия</div><strong>{escape(inspection.state_label)}</strong></div>
      <div class="metric"><div class="eyebrow">Статус работ</div><strong>{escape(inspection.work_status_label)}</strong></div>
      <div class="metric"><div class="eyebrow">Текущие метрики</div><strong>RMS {current_metrics.get('rms', 0):.3f} · Peak {current_metrics.get('peak', 0):.3f}</strong></div>
      <div class="metric"><div class="eyebrow">Маршрут объекта</div><strong>{escape(' → '.join(lifecycle_route) if lifecycle_route else 'Нет маршрута')}</strong></div>
    </div>

    <div class="card">
      <div class="eyebrow">Краткое резюме</div>
      <p style="line-height:1.8">{escape(report.summary)}</p>
      <p style="line-height:1.8"><strong>Рекомендации:</strong> {escape(report.recommendations)}</p>
      <p style="line-height:1.8"><strong>Комментарий инженера:</strong> {escape(inspection.engineer_reason or 'Не указан')}</p>
      <p style="line-height:1.8"><strong>Что выполнено / дальше:</strong> {escape(inspection.action_taken or 'Не указано')}</p>
    </div>

    {baseline_html}
    {comparison_html}
    {measurement_html}

    <div class="card">
      <div class="eyebrow">Top-5 вероятностей модели</div>
      <table>{rows}</table>
    </div>

    <div class="card">
      <div class="eyebrow">История объекта</div>
      <table>
        <thead>
          <tr><td>Дата</td><td>Стадия</td><td>Статус</td><td>Диагноз</td><td>Уверенность</td></tr>
        </thead>
        <tbody>{history_rows}</tbody>
      </table>
    </div>
  </div>
</body>
</html>"""


def create_persisted_session(user: User, request: Request, session: Session) -> tuple[UserSession, str]:
    raw_token = generate_session_token()
    session_row = UserSession(
        user_id=user.id,
        token_hash=hash_session_token(raw_token),
        user_agent=request.headers.get("user-agent"),
        expires_at=utcnow() + timedelta(days=settings.session_ttl_days),
    )
    session.add(session_row)
    session.commit()
    session.refresh(session_row)
    return session_row, raw_token


def build_auth_payload(user: User, session_row: UserSession) -> AuthPayload:
    return AuthPayload(
        user=serialize_user(user),
        session=AuthSessionRead(
            id=session_row.id,
            expires_at=session_row.expires_at,
            last_seen_at=session_row.last_seen_at,
        ),
    )


@api.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@api.post("/auth/register", response_model=AuthPayload, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegisterRequest, request: Request, response: Response, session: Session = Depends(get_session)):
    existing = session.exec(select(User).where(User.email == payload.email.strip().lower())).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User with this email already exists")

    user = User(
        email=payload.email.strip().lower(),
        display_name=payload.display_name.strip(),
        role=payload.role.strip() or "operator",
        password_hash=hash_password(payload.password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    session_row, raw_token = create_persisted_session(user, request, session)
    set_session_cookie(response, session_row, raw_token)
    return build_auth_payload(user, session_row)


@api.post("/auth/login", response_model=AuthPayload)
def login(payload: UserLoginRequest, request: Request, response: Response, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == payload.email.strip().lower())).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    session_row, raw_token = create_persisted_session(user, request, session)
    set_session_cookie(response, session_row, raw_token)
    return build_auth_payload(user, session_row)


@api.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response, auth: tuple[User, UserSession] = Depends(get_current_auth), session: Session = Depends(get_session)):
    _, session_row = auth
    existing = session.get(UserSession, session_row.id)
    if existing:
        session.delete(existing)
        session.commit()
    clear_session_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return None


@api.get("/auth/me", response_model=AuthPayload)
def me(auth: tuple[User, UserSession] = Depends(get_current_auth)):
    user, session_row = auth
    return build_auth_payload(user, session_row)


@api.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary(auth: tuple[User, UserSession] = Depends(get_current_auth), session: Session = Depends(get_session)):
    user, _ = auth
    ensure_alerts_for_user(session, user)
    session.commit()
    inspections = session.exec(
        select(Inspection).where(Inspection.user_id == user.id).order_by(Inspection.created_at.desc())
    ).all()
    assets = session.exec(select(Asset).where(Asset.owner_id == user.id)).all()
    reports = session.exec(select(Report).where(Report.user_id == user.id)).all()
    measurements = session.exec(select(Measurement).where(Measurement.user_id == user.id)).all()
    alerts = session.exec(select(Alert).where(Alert.user_id == user.id)).all()
    alert_events = session.exec(
        select(AlertEvent).join(Alert, Alert.id == AlertEvent.alert_id).where(Alert.user_id == user.id)
    ).all()
    latest = inspections[0].created_at if inspections else None
    return DashboardSummary(
        inspections=len(inspections),
        assets=len(assets),
        reports=len(reports),
        measurements=len(measurements),
        alerts_active=len([item for item in alerts if item.status != "resolved"]),
        alert_events=len(alert_events),
        latest_inspection_at=latest,
    )


@api.get("/alerts", response_model=list[AlertRead])
def list_alerts(
    status_filter: str | None = None,
    asset_id: str | None = None,
    auth: tuple[User, UserSession] = Depends(get_current_auth),
    session: Session = Depends(get_session),
):
    user, _ = auth
    ensure_alerts_for_user(session, user)
    session.commit()

    statement = select(Alert).where(Alert.user_id == user.id)
    if asset_id:
        statement = statement.where(Alert.asset_id == asset_id)
    if status_filter:
        statement = statement.where(Alert.status == status_filter)
    statement = statement.order_by(Alert.updated_at.desc())
    alerts = session.exec(statement).all()
    assets = {asset.id: asset for asset in session.exec(select(Asset).where(Asset.owner_id == user.id)).all()}
    counts: dict[str, int] = {}
    for event in session.exec(select(AlertEvent).join(Alert, Alert.id == AlertEvent.alert_id).where(Alert.user_id == user.id)).all():
        counts[event.alert_id] = counts.get(event.alert_id, 0) + 1
    alerts.sort(
        key=lambda item: (
            item.status == "resolved",
            -(ALERT_SEVERITY_ORDER.get(item.severity, 0)),
            -(item.last_event_at or item.updated_at).timestamp(),
        )
    )
    return [serialize_alert(item, assets[item.asset_id], counts.get(item.id, 0)) for item in alerts if item.asset_id in assets]


@api.get("/alerts/{alert_id}/events", response_model=list[AlertEventRead])
def get_alert_events(
    alert_id: str,
    auth: tuple[User, UserSession] = Depends(get_current_auth),
    session: Session = Depends(get_session),
):
    user, _ = auth
    alert = session.get(Alert, alert_id)
    if not alert or alert.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    authors = {row.id: row for row in session.exec(select(User).where(User.id == user.id)).all()}
    return [serialize_alert_event(item, authors.get(item.user_id)) for item in list_alert_events(session, user.id, alert_id)]


@api.post("/alerts/{alert_id}/events", response_model=AlertRead)
def create_alert_log_event(
    alert_id: str,
    payload: AlertEventCreate,
    auth: tuple[User, UserSession] = Depends(get_current_auth),
    session: Session = Depends(get_session),
):
    user, _ = auth
    alert = session.get(Alert, alert_id)
    if not alert or alert.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    asset = session.get(Asset, alert.asset_id)
    if not asset or asset.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    if payload.next_status and payload.next_status not in ALERT_STATUS_FLOW:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported alert status")
    if not (payload.message or payload.next_status):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Event must include a message or a status change")

    create_alert_event(
        session,
        alert=alert,
        user=user,
        event_type=payload.event_type or "note",
        message=payload.message or "Lifecycle updated.",
        inspection_id=alert.inspection_id,
        next_status=payload.next_status,
        metadata=payload.metadata,
    )
    session.commit()
    session.refresh(alert)
    return serialize_alert(alert, asset, len(list_alert_events(session, user.id, alert.id)))


@api.get("/assets", response_model=list[AssetRead])
def list_assets(auth: tuple[User, UserSession] = Depends(get_current_auth), session: Session = Depends(get_session)):
    user, _ = auth
    statement = select(Asset).where(Asset.owner_id == user.id).order_by(Asset.updated_at.desc())
    return [serialize_asset(asset) for asset in session.exec(statement).all()]


@api.post("/assets", response_model=AssetRead, status_code=status.HTTP_201_CREATED)
def create_asset(payload: AssetCreate, auth: tuple[User, UserSession] = Depends(get_current_auth), session: Session = Depends(get_session)):
    user, _ = auth
    asset = get_asset_by_name(session, user.id, payload.name.strip())
    if asset:
        asset.asset_type = payload.asset_type
        asset.location = payload.location
        asset.description = payload.description
        asset.current_status = payload.current_status
        asset.updated_at = utcnow()
    else:
        asset = Asset(
            owner_id=user.id,
            name=payload.name.strip(),
            asset_type=payload.asset_type,
            location=payload.location,
            description=payload.description,
            current_status=payload.current_status,
        )
    session.add(asset)
    session.commit()
    session.refresh(asset)
    return serialize_asset(asset)


@api.get("/measurements", response_model=list[MeasurementRead])
def get_measurements(
    asset_id: str | None = None,
    auth: tuple[User, UserSession] = Depends(get_current_auth),
    session: Session = Depends(get_session),
):
    user, _ = auth
    assets = {asset.id: asset for asset in session.exec(select(Asset).where(Asset.owner_id == user.id)).all()}
    return [
        serialize_measurement(item, assets[item.asset_id])
        for item in list_measurements(session, user.id, asset_id)
        if item.asset_id in assets
    ]


@api.post("/measurements/upload", response_model=MeasurementRead, status_code=status.HTTP_201_CREATED)
def upload_measurement(
    payload: MeasurementUploadRequest,
    auth: tuple[User, UserSession] = Depends(get_current_auth),
    session: Session = Depends(get_session),
):
    user, _ = auth
    asset = session.get(Asset, payload.asset_id) if payload.asset_id else None
    if asset and asset.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Asset belongs to another user")
    if not asset:
        asset = get_or_create_asset(
            session,
            owner_id=user.id,
            name=payload.asset_name.strip(),
            current_status="healthy",
        )

    try:
        raw_bytes = base64.b64decode(payload.content_base64.encode("utf-8"), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid base64 payload") from exc

    measurement = Measurement(
        user_id=user.id,
        asset_id=asset.id,
        source_kind=payload.source_kind,
        source_label=payload.source_label,
        original_name=sanitize_filename(payload.original_name),
        stored_name="",
        file_ext=Path(payload.original_name).suffix.lower() or None,
        mime_type=payload.mime_type,
        storage_path="",
        storage_size=len(raw_bytes),
        input_label=payload.input_label,
        predicted_class=payload.predicted_class,
        confidence=payload.confidence,
        sample_rate=payload.sample_rate,
        sample_count=payload.sample_count,
        duration_seconds=payload.duration_seconds,
        note=payload.note,
        probabilities_json=dumps_json(payload.probabilities),
        input_json=dumps_json(payload.input_context),
        preview_signal_json=dumps_json(payload.preview_signal),
    )
    path, stored_name = measurement_storage_path(user.id, measurement.id, measurement.original_name)
    path.write_bytes(raw_bytes)
    measurement.stored_name = stored_name
    measurement.storage_path = str(path)
    session.add(measurement)
    session.commit()
    session.refresh(measurement)
    asset.updated_at = utcnow()
    session.add(asset)
    session.commit()
    return serialize_measurement(measurement, asset)


@api.get("/measurements/{measurement_id}/download")
def download_measurement(
    measurement_id: str,
    auth: tuple[User, UserSession] = Depends(get_current_auth),
    session: Session = Depends(get_session),
):
    user, _ = auth
    measurement = session.get(Measurement, measurement_id)
    if not measurement or measurement.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Measurement not found")
    target = Path(measurement.storage_path)
    if not target.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Measurement file not found")
    return FileResponse(target, filename=measurement.original_name, media_type=measurement.mime_type or "application/octet-stream")


@api.get("/inspections", response_model=list[InspectionRead])
def list_inspections(
    asset_id: str | None = None,
    auth: tuple[User, UserSession] = Depends(get_current_auth),
    session: Session = Depends(get_session),
):
    user, _ = auth
    statement = select(Inspection).where(Inspection.user_id == user.id)
    if asset_id:
        statement = statement.where(Inspection.asset_id == asset_id)
    statement = statement.order_by(Inspection.created_at.desc())
    inspections = session.exec(statement).all()
    assets = {asset.id: asset for asset in session.exec(select(Asset).where(Asset.owner_id == user.id)).all()}
    return [serialize_inspection(item, assets[item.asset_id]) for item in inspections if item.asset_id in assets]


@api.get("/inspections/{inspection_id}", response_model=InspectionRead)
def get_inspection(
    inspection_id: str,
    auth: tuple[User, UserSession] = Depends(get_current_auth),
    session: Session = Depends(get_session),
):
    user, _ = auth
    inspection = session.get(Inspection, inspection_id)
    if not inspection or inspection.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")
    asset = session.get(Asset, inspection.asset_id)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    return serialize_inspection(inspection, asset)


@api.delete("/inspections/{inspection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_inspection(
    inspection_id: str,
    auth: tuple[User, UserSession] = Depends(get_current_auth),
    session: Session = Depends(get_session),
):
    user, _ = auth
    inspection = session.get(Inspection, inspection_id)
    if not inspection or inspection.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")
    snapshots = session.exec(select(Snapshot).where(Snapshot.inspection_id == inspection.id)).all()
    reports = session.exec(select(Report).where(Report.inspection_id == inspection.id)).all()
    measurements = session.exec(select(Measurement).where(Measurement.inspection_id == inspection.id)).all()
    alerts = session.exec(select(Alert).where(Alert.inspection_id == inspection.id, Alert.user_id == user.id)).all()
    for row in snapshots + reports:
        session.delete(row)
    for row in measurements:
        row.inspection_id = None
        row.updated_at = utcnow()
        session.add(row)
    for row in alerts:
        row.inspection_id = None
        row.updated_at = utcnow()
        session.add(row)
    session.delete(inspection)
    session.commit()
    return None


@api.post("/inspections", response_model=InspectionRead, status_code=status.HTTP_201_CREATED)
def create_inspection(
    payload: InspectionCreate,
    auth: tuple[User, UserSession] = Depends(get_current_auth),
    session: Session = Depends(get_session),
):
    user, _ = auth
    measurement = session.get(Measurement, payload.measurement_id) if payload.measurement_id else None
    if measurement and measurement.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Measurement belongs to another user")
    asset = session.get(Asset, payload.asset_id) if payload.asset_id else None
    if asset and asset.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Asset belongs to another user")
    if measurement and not asset:
        asset = session.get(Asset, measurement.asset_id)
    if measurement and asset and measurement.asset_id != asset.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Measurement belongs to another asset")
    if not asset:
        asset = get_or_create_asset(
            session,
            owner_id=user.id,
            name=payload.asset_name.strip(),
            current_status=payload.state_key,
        )

    mark_as_baseline = payload.is_baseline or should_auto_mark_baseline(session, user.id, asset.id, payload)
    created_at = payload.created_at or utcnow()
    inspection = Inspection(
        user_id=user.id,
        asset_id=asset.id,
        measurement_id=measurement.id if measurement else None,
        title=payload.title,
        input_type=payload.input_type,
        input_label=payload.input_label,
        predicted_class=payload.predicted_class,
        confidence=payload.confidence,
        state_key=payload.state_key,
        state_label=resolve_state_label(payload.state_key, payload.state_label),
        work_status=payload.work_status,
        work_status_label=resolve_work_status_label(payload.work_status, payload.work_status_label),
        is_baseline=mark_as_baseline,
        note=payload.note,
        engineer_reason=payload.engineer_reason,
        action_taken=payload.action_taken,
        source_label=payload.source_label,
        sample_rate=payload.sample_rate,
        probabilities_json=dumps_json(payload.probabilities),
        playbook_json=dumps_json(payload.playbook),
        input_json=dumps_json(payload.input_context),
        signal_data_json=dumps_json(payload.signal_data),
        created_at=created_at,
        updated_at=created_at,
    )
    session.add(inspection)
    session.commit()
    session.refresh(inspection)

    if mark_as_baseline:
        clear_asset_baseline(session, user.id, asset.id, exclude_inspection_id=inspection.id)

    asset.current_status = payload.state_key
    asset.updated_at = utcnow()
    session.add(asset)

    snapshot = Snapshot(
        inspection_id=inspection.id,
        user_id=user.id,
        label=payload.input_label,
        snapshot_type="inspection_state",
        simulator_state_json=dumps_json(
            {
                "asset_name": asset.name,
                "state_key": payload.state_key,
                "input_context": payload.input_context,
            }
        ),
        diagnosis_json=dumps_json(
            {
                "predicted_class": payload.predicted_class,
                "confidence": payload.confidence,
                "probabilities": payload.probabilities,
                "playbook": payload.playbook,
                "work_status": payload.work_status,
            }
        ),
        created_at=created_at,
    )
    session.add(snapshot)
    if measurement:
        measurement.inspection_id = inspection.id
        measurement.updated_at = utcnow()
        session.add(measurement)
    sync_alert_for_inspection(session, user, asset, inspection)
    session.commit()
    session.refresh(inspection)
    session.refresh(asset)
    return serialize_inspection(inspection, asset)


@api.patch("/inspections/{inspection_id}", response_model=InspectionRead)
def update_inspection(
    inspection_id: str,
    payload: InspectionUpdate,
    auth: tuple[User, UserSession] = Depends(get_current_auth),
    session: Session = Depends(get_session),
):
    user, _ = auth
    inspection = session.get(Inspection, inspection_id)
    if not inspection or inspection.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")
    asset = session.get(Asset, inspection.asset_id)
    if not asset or asset.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    if payload.title is not None:
        inspection.title = payload.title or None
    if payload.state_key is not None:
        inspection.state_key = payload.state_key
        inspection.state_label = resolve_state_label(payload.state_key, payload.state_label)
        asset.current_status = payload.state_key
        asset.updated_at = utcnow()
    elif payload.state_label is not None:
        inspection.state_label = payload.state_label
    if payload.work_status is not None:
        inspection.work_status = payload.work_status
        inspection.work_status_label = resolve_work_status_label(payload.work_status, payload.work_status_label)
    elif payload.work_status_label is not None:
        inspection.work_status_label = payload.work_status_label
    if payload.is_baseline is not None:
        if payload.is_baseline:
            clear_asset_baseline(session, user.id, asset.id, exclude_inspection_id=inspection.id)
            inspection.is_baseline = True
        else:
            inspection.is_baseline = False
    if payload.note is not None:
        inspection.note = payload.note or None
    if payload.engineer_reason is not None:
        inspection.engineer_reason = payload.engineer_reason or None
    if payload.action_taken is not None:
        inspection.action_taken = payload.action_taken or None

    inspection.updated_at = utcnow()
    session.add(inspection)
    session.add(asset)
    sync_alert_for_inspection(session, user, asset, inspection)
    session.commit()
    session.refresh(inspection)
    session.refresh(asset)
    return serialize_inspection(inspection, asset)


@api.get("/snapshots", response_model=list[SnapshotRead])
def list_snapshots(
    inspection_id: str | None = None,
    auth: tuple[User, UserSession] = Depends(get_current_auth),
    session: Session = Depends(get_session),
):
    user, _ = auth
    statement = select(Snapshot).where(Snapshot.user_id == user.id)
    if inspection_id:
        statement = statement.where(Snapshot.inspection_id == inspection_id)
    statement = statement.order_by(Snapshot.created_at.desc())
    return [serialize_snapshot(item) for item in session.exec(statement).all()]


@api.post("/snapshots", response_model=SnapshotRead, status_code=status.HTTP_201_CREATED)
def create_snapshot(
    payload: SnapshotCreate,
    auth: tuple[User, UserSession] = Depends(get_current_auth),
    session: Session = Depends(get_session),
):
    user, _ = auth
    inspection = session.get(Inspection, payload.inspection_id)
    if not inspection or inspection.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")
    snapshot = Snapshot(
        inspection_id=payload.inspection_id,
        user_id=user.id,
        label=payload.label,
        snapshot_type=payload.snapshot_type,
        simulator_state_json=dumps_json(payload.simulator_state),
        diagnosis_json=dumps_json(payload.diagnosis),
    )
    session.add(snapshot)
    session.commit()
    session.refresh(snapshot)
    return serialize_snapshot(snapshot)


@api.get("/reports", response_model=list[ReportRead])
def list_reports(
    inspection_id: str | None = None,
    auth: tuple[User, UserSession] = Depends(get_current_auth),
    session: Session = Depends(get_session),
):
    user, _ = auth
    statement = select(Report).where(Report.user_id == user.id)
    if inspection_id:
        statement = statement.where(Report.inspection_id == inspection_id)
    statement = statement.order_by(Report.updated_at.desc())
    return [serialize_report(item) for item in session.exec(statement).all()]


@api.post("/reports", response_model=ReportRead, status_code=status.HTTP_201_CREATED)
def create_report(
    payload: ReportCreate,
    auth: tuple[User, UserSession] = Depends(get_current_auth),
    session: Session = Depends(get_session),
):
    user, _ = auth
    inspection = session.get(Inspection, payload.inspection_id)
    if not inspection or inspection.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")
    report = Report(
        inspection_id=payload.inspection_id,
        user_id=user.id,
        title=payload.title,
        report_type=payload.report_type,
        status=payload.status,
        share_token=new_id(),
        summary=payload.summary,
        recommendations=payload.recommendations,
        payload_json=dumps_json(payload.payload),
    )
    session.add(report)
    session.commit()
    session.refresh(report)
    return serialize_report(report)


@api.post("/reports/from-inspection/{inspection_id}", response_model=ReportRead)
def generate_report_from_inspection(
    inspection_id: str,
    auth: tuple[User, UserSession] = Depends(get_current_auth),
    session: Session = Depends(get_session),
):
    user, _ = auth
    inspection = session.get(Inspection, inspection_id)
    if not inspection or inspection.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")
    asset = session.get(Asset, inspection.asset_id)
    if not asset or asset.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    fields = build_report_fields(session, inspection, asset)
    report = get_report_for_inspection(session, user.id, inspection.id)
    if report:
        report.title = fields["title"]
        report.status = fields["status"]
        report.summary = fields["summary"]
        report.recommendations = fields["recommendations"]
        report.payload_json = dumps_json(fields["payload"])
        report.updated_at = utcnow()
        if not report.share_token:
            report.share_token = new_id()
    else:
        report = Report(
            inspection_id=inspection.id,
            user_id=user.id,
            title=fields["title"],
            report_type="inspection",
            status=fields["status"],
            share_token=new_id(),
            summary=fields["summary"],
            recommendations=fields["recommendations"],
            payload_json=dumps_json(fields["payload"]),
        )
    session.add(report)
    session.commit()
    session.refresh(report)
    return serialize_report(report)


@api.post("/migrations/import-local-history", response_model=ImportLocalHistoryResponse)
def import_local_history(
    payload: ImportLocalHistoryRequest,
    auth: tuple[User, UserSession] = Depends(get_current_auth),
    session: Session = Depends(get_session),
):
    user, _ = auth
    imported_count = 0
    touched_assets: set[str] = set()
    for item in payload.items:
        asset = get_or_create_asset(
            session,
            owner_id=user.id,
            name=item.asset_name.strip(),
            current_status=item.state_key,
        )
        touched_assets.add(asset.id)
        mark_as_baseline = item.is_baseline or should_auto_mark_baseline(session, user.id, asset.id, item)
        created_at = item.created_at or utcnow()
        inspection = Inspection(
            user_id=user.id,
            asset_id=asset.id,
            title=item.title,
            input_type=item.input_type,
            input_label=item.input_label,
            predicted_class=item.predicted_class,
            confidence=item.confidence,
            state_key=item.state_key,
            state_label=resolve_state_label(item.state_key, item.state_label),
            work_status=item.work_status,
            work_status_label=resolve_work_status_label(item.work_status, item.work_status_label),
            is_baseline=mark_as_baseline,
            note=item.note,
            engineer_reason=item.engineer_reason,
            action_taken=item.action_taken,
            source_label=item.source_label,
            sample_rate=item.sample_rate,
            probabilities_json=dumps_json(item.probabilities),
            playbook_json=dumps_json(item.playbook),
            input_json=dumps_json(item.input_context),
            signal_data_json=dumps_json(item.signal_data),
            created_at=created_at,
            updated_at=created_at,
        )
        session.add(inspection)
        session.commit()
        session.refresh(inspection)
        if mark_as_baseline:
            clear_asset_baseline(session, user.id, asset.id, exclude_inspection_id=inspection.id)

        snapshot = Snapshot(
            inspection_id=inspection.id,
            user_id=user.id,
            label=item.input_label,
            snapshot_type="legacy_import",
            simulator_state_json=dumps_json({"source": "localStorage", "state_key": item.state_key}),
            diagnosis_json=dumps_json({"predicted_class": item.predicted_class, "confidence": item.confidence}),
            created_at=created_at,
        )
        session.add(snapshot)
        sync_alert_for_inspection(session, user, asset, inspection)
        session.commit()
        imported_count += 1
    return ImportLocalHistoryResponse(imported_count=imported_count, asset_count=len(touched_assets))


def create_app(database_url: str | None = None) -> FastAPI:
    """Create a configured FastAPI application."""

    app = FastAPI(title=settings.app_name, version="0.2.0")
    app.state.engine = build_engine(database_url or settings.database_url)
    init_db(app.state.engine)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allow_origins) or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    for api_prefix in build_route_variants("/api"):
        app.include_router(api, prefix=api_prefix)

    web_dir = Path(BASE_DIR) / "web"
    if web_dir.exists():
        def index():
            return FileResponse(web_dir / "index.html")

        def simulator():
            return FileResponse(web_dir / "simulator.html")

        def shared_report(share_token: str):
            with Session(app.state.engine) as session:
                report = session.exec(select(Report).where(Report.share_token == share_token)).first()
                if not report:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
                inspection = session.get(Inspection, report.inspection_id)
                asset = session.get(Asset, inspection.asset_id) if inspection else None
                if not inspection or not asset:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report data is incomplete")
                return HTMLResponse(render_public_report(report, inspection, asset))

        def static_proxy(file_path: str):
            target = resolve_web_target(web_dir, file_path)
            if target is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
            if target.is_file():
                return FileResponse(target)
            return FileResponse(web_dir / "index.html")

        for route in build_route_variants("/"):
            app.add_api_route(route, index, methods=["GET"], include_in_schema=False)

        for route in build_route_variants("/simulator.html"):
            app.add_api_route(route, simulator, methods=["GET"], include_in_schema=False)

        for route in build_route_variants("/shared/reports/{share_token}"):
            app.add_api_route(route, shared_report, methods=["GET"], include_in_schema=False)

        for route in build_route_variants("/{file_path:path}"):
            app.add_api_route(route, static_proxy, methods=["GET"], include_in_schema=False)

    return app


app = create_app()
