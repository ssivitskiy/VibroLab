"""Integration tests for the FastAPI backend."""

from __future__ import annotations

import base64

from fastapi.testclient import TestClient

from backend.main import create_app


def build_client(tmp_path) -> TestClient:
    db_url = f"sqlite:///{(tmp_path / 'vibrolab-test.db').as_posix()}"
    app = create_app(database_url=db_url)
    return TestClient(app)


def register(client: TestClient) -> dict:
    response = client.post(
        "/api/auth/register",
        json={
            "email": "engineer@vibrolab.ai",
            "password": "supersecret123",
            "display_name": "Chief Engineer",
            "role": "expert",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_auth_and_server_history_flow(tmp_path):
    client = build_client(tmp_path)

    auth_payload = register(client)
    assert auth_payload["user"]["email"] == "engineer@vibrolab.ai"

    create_baseline = client.post(
        "/api/inspections",
        json={
            "asset_name": "Gearbox A-01",
            "state_key": "healthy",
            "state_label": "Healthy",
            "work_status": "observe",
            "work_status_label": "Наблюдать",
            "is_baseline": True,
            "note": "Эталонный исправный сеанс для сравнения.",
            "engineer_reason": "Узел исправен и используется как baseline.",
            "action_taken": "Сохранить как эталон для следующих инспекций.",
            "predicted_class": "normal",
            "confidence": 0.994,
            "source_label": "SEU full dataset",
            "input_type": "demo",
            "input_label": "Demo · Normal baseline",
            "sample_rate": 5120,
            "probabilities": {"normal": 0.994},
            "playbook": {"priority": "Baseline ready"},
            "input_context": {"scenario": "normal"},
            "signal_data": [0.02, 0.01, -0.01, 0.0],
        },
    )
    assert create_baseline.status_code == 201, create_baseline.text
    baseline = create_baseline.json()
    assert baseline["is_baseline"] is True

    create_inspection = client.post(
        "/api/inspections",
        json={
            "asset_name": "Gearbox A-01",
            "state_key": "warning",
            "state_label": "Warning",
            "work_status": "inspect",
            "work_status_label": "Проверить",
            "note": "Рост ударных импульсов на GMF.",
            "engineer_reason": "Рост ударных импульсов и боковых полос вокруг GMF.",
            "action_taken": "Назначен осмотр зубчатой пары.",
            "predicted_class": "tooth_miss",
            "confidence": 0.982,
            "source_label": "SEU full dataset",
            "input_type": "demo",
            "input_label": "Demo · Missing tooth",
            "sample_rate": 5120,
            "probabilities": {"tooth_miss": 0.982, "tooth_chip": 0.015},
            "playbook": {"priority": "Немедленное вмешательство"},
            "input_context": {"scenario": "tooth_miss"},
            "signal_data": [0.1, 0.2, 0.3, 0.1],
        },
    )
    assert create_inspection.status_code == 201, create_inspection.text
    inspection = create_inspection.json()
    assert inspection["asset_name"] == "Gearbox A-01"
    assert inspection["predicted_class"] == "tooth_miss"
    assert inspection["work_status"] == "inspect"
    assert inspection["engineer_reason"] == "Рост ударных импульсов и боковых полос вокруг GMF."
    assert inspection["is_baseline"] is False

    history = client.get("/api/inspections")
    assert history.status_code == 200
    assert len(history.json()) == 2
    assert any(item["is_baseline"] for item in history.json())

    alerts = client.get("/api/alerts")
    assert alerts.status_code == 200, alerts.text
    assert len(alerts.json()) == 1
    alert = alerts.json()[0]
    assert alert["asset_name"] == "Gearbox A-01"
    assert alert["status"] == "new"
    assert alert["current_class"] == "tooth_miss"

    alert_events = client.get(f"/api/alerts/{alert['id']}/events")
    assert alert_events.status_code == 200, alert_events.text
    assert len(alert_events.json()) == 1
    assert alert_events.json()[0]["event_type"] == "created"

    updated = client.patch(
        f"/api/inspections/{inspection['id']}",
        json={
            "state_key": "service",
            "work_status": "repair",
            "engineer_reason": "Warning-сеанс подтверждён, объект переведён в ремонтный цикл.",
            "action_taken": "Назначен ремонт зубчатой пары и повторная контрольная запись.",
        },
    )
    assert updated.status_code == 200, updated.text
    updated_payload = updated.json()
    assert updated_payload["state_key"] == "service"
    assert updated_payload["work_status"] == "repair"

    alerts_after_service = client.get("/api/alerts")
    assert alerts_after_service.status_code == 200
    alert_after_service = alerts_after_service.json()[0]
    assert alert_after_service["status"] == "in_progress"
    assert alert_after_service["events_count"] >= 2

    resolved = client.post(
        f"/api/alerts/{alert_after_service['id']}/events",
        json={
            "event_type": "resolve",
            "next_status": "resolved",
            "message": "Ремонт завершён, контрольная запись подтверждает закрытие alert-а.",
        },
    )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "resolved"

    resolved_events = client.get(f"/api/alerts/{alert_after_service['id']}/events")
    assert resolved_events.status_code == 200
    assert resolved_events.json()[0]["to_status"] == "resolved"
    assert "закрытие" in resolved_events.json()[0]["message"].lower()

    create_snapshot = client.post(
        "/api/snapshots",
        json={
            "inspection_id": inspection["id"],
            "label": "Exploded view",
            "snapshot_type": "camera",
            "simulator_state": {"camera": "inspection"},
            "diagnosis": {"predicted_class": "tooth_miss"},
        },
    )
    assert create_snapshot.status_code == 201, create_snapshot.text

    create_report = client.post(f"/api/reports/from-inspection/{inspection['id']}")
    assert create_report.status_code == 200, create_report.text
    report = create_report.json()
    assert report["share_url"].startswith("/shared/reports/")
    assert report["payload"]["baseline"]["id"] == baseline["id"]
    assert report["payload"]["comparison"]["baseline_id"] == baseline["id"]
    assert report["payload"]["comparison"]["target_id"] == inspection["id"]

    shared = client.get(report["share_url"])
    assert shared.status_code == 200
    assert "VibroLab Report" in shared.text
    assert "Gearbox A-01" in shared.text
    assert "Сравнение с baseline" in shared.text

    summary = client.get("/api/dashboard/summary")
    assert summary.status_code == 200
    assert summary.json()["inspections"] == 2
    assert summary.json()["assets"] == 1
    assert summary.json()["reports"] == 1
    assert summary.json()["measurements"] == 0
    assert summary.json()["alerts_active"] == 0
    assert summary.json()["alert_events"] >= 3


def test_import_legacy_history_and_delete(tmp_path):
    client = build_client(tmp_path)
    register(client)

    imported = client.post(
        "/api/migrations/import-local-history",
        json={
            "items": [
                {
                    "asset_name": "Bearing Unit B-03",
                    "state_key": "warning",
                    "state_label": "Warning",
                    "work_status": "inspect",
                    "work_status_label": "Проверить",
                    "note": "Импорт из локального журнала.",
                    "engineer_reason": "Импортированный сигнал требует подтверждения на стенде.",
                    "action_taken": "Назначить повторную запись после осмотра.",
                    "predicted_class": "inner_race",
                    "confidence": 0.91,
                    "source_label": "Browser inference",
                    "input_type": "file",
                    "input_label": "WAV · imported.wav",
                    "sample_rate": 5120,
                    "probabilities": {"inner_race": 0.91},
                    "playbook": {"priority": "Ускоренное обслуживание"},
                    "input_context": {"type": "file"},
                    "signal_data": [0.0, 0.5, -0.1],
                }
            ]
        },
    )
    assert imported.status_code == 200, imported.text
    assert imported.json()["imported_count"] == 1

    history = client.get("/api/inspections")
    assert history.status_code == 200
    item = history.json()[0]
    assert item["asset_name"] == "Bearing Unit B-03"
    assert item["work_status"] == "inspect"
    assert item["action_taken"] == "Назначить повторную запись после осмотра."
    assert item["is_baseline"] is False

    deleted = client.delete(f"/api/inspections/{item['id']}")
    assert deleted.status_code == 204

    history_after = client.get("/api/inspections")
    assert history_after.status_code == 200
    assert history_after.json() == []


def test_measurement_upload_download_and_link_to_inspection(tmp_path):
    client = build_client(tmp_path)
    register(client)

    content = base64.b64encode(b"time,acc\n0,0.01\n1,0.12\n").decode("utf-8")
    uploaded = client.post(
        "/api/measurements/upload",
        json={
            "asset_name": "Motor M-11",
            "source_kind": "uploaded_file",
            "source_label": "Real monitoring",
            "input_label": "CSV · motor-m11.csv",
            "original_name": "motor-m11.csv",
            "mime_type": "text/csv",
            "content_base64": content,
            "sample_rate": 2560,
            "sample_count": 3,
            "duration_seconds": 0.001,
            "predicted_class": "inner_race",
            "confidence": 0.88,
            "probabilities": {"inner_race": 0.88, "outer_race": 0.08},
            "input_context": {"type": "file", "name": "motor-m11.csv"},
            "preview_signal": [0.01, 0.12, -0.05],
            "note": "Первый реальный файл из monitoring-контура.",
        },
    )
    assert uploaded.status_code == 201, uploaded.text
    measurement = uploaded.json()
    assert measurement["asset_name"] == "Motor M-11"
    assert measurement["predicted_class"] == "inner_race"
    assert measurement["inspection_id"] is None
    assert measurement["download_url"].startswith("/api/measurements/")

    measurements = client.get("/api/measurements")
    assert measurements.status_code == 200
    assert len(measurements.json()) == 1

    downloaded = client.get(measurement["download_url"])
    assert downloaded.status_code == 200
    assert downloaded.content == b"time,acc\n0,0.01\n1,0.12\n"

    created = client.post(
        "/api/inspections",
        json={
            "asset_name": "Motor M-11",
            "measurement_id": measurement["id"],
            "state_key": "warning",
            "state_label": "Warning",
            "work_status": "inspect",
            "work_status_label": "Проверить",
            "predicted_class": "inner_race",
            "confidence": 0.88,
            "source_label": "Real monitoring",
            "input_type": "file",
            "input_label": "CSV · motor-m11.csv",
            "sample_rate": 2560,
            "probabilities": {"inner_race": 0.88},
            "playbook": {"priority": "Повторить измерение после осмотра."},
            "input_context": {"type": "file", "measurementId": measurement["id"]},
            "signal_data": [0.01, 0.12, -0.05],
        },
    )
    assert created.status_code == 201, created.text
    inspection = created.json()
    assert inspection["measurement_id"] == measurement["id"]

    measurements_after = client.get("/api/measurements")
    assert measurements_after.status_code == 200
    assert measurements_after.json()[0]["inspection_id"] == inspection["id"]

    summary = client.get("/api/dashboard/summary")
    assert summary.status_code == 200
    assert summary.json()["measurements"] == 1


def test_static_path_traversal_is_blocked(tmp_path):
    client = build_client(tmp_path)

    response = client.get("/..%2F..%2F..%2F..%2F..%2F..%2Fproc/self/cwd/.git/config")
    assert response.status_code == 404
