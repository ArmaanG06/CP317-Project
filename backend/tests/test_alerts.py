"""ALT-1: recipient isolation, filters, review state and durable creation."""

import uuid

import pytest
from sqlalchemy import func, select

from app import readings
from app.access import assign_patient
from app.alerts import ProfessionalAlert, backfill_alerts
from app.readings import Reading
from app.thresholds import ReadingEvaluation, assess_readings


def test_each_assignee_gets_an_independent_alert(patient1_client, professional_client,
                                                 professional2_client, db_session, users):
    patient_id = users["patient1"].id
    assign_patient(db_session, users["professional"].id, patient_id)
    assign_patient(db_session, users["professional2"].id, patient_id)
    response = patient1_client.post("/readings", json={"systolic": 140, "diastolic": 59})
    assert response.status_code == 201
    assert {row["vital_type"] for row in response.json() if row["flag"]} == {"systolic", "diastolic"}

    first = professional_client.get("/professionals/me/alerts").json()
    second = professional2_client.get("/professionals/me/alerts").json()
    assert first["unreviewed_count"] == second["unreviewed_count"] == 2
    assert len(first["alerts"]) == len(second["alerts"]) == 2
    assert {item["vital_type"] for item in first["alerts"]} == {"systolic", "diastolic"}
    assert {item["id"] for item in first["alerts"]}.isdisjoint(item["id"] for item in second["alerts"])
    assert all(item["patient_id"] == str(patient_id) and item["patient_name"] == "Patient One"
               for item in first["alerts"])

    alert_id = first["alerts"][0]["id"]
    path = f"/professionals/me/alerts/{alert_id}/review"
    assert professional2_client.patch(path).status_code == 404
    first_review = professional_client.patch(path)
    assert first_review.status_code == 200
    assert first_review.json()["reviewed_at"]
    assert professional_client.patch(path).json() == first_review.json()
    assert professional_client.get("/professionals/me/alerts/count").json()["unreviewed_count"] == 1
    assert professional2_client.get("/professionals/me/alerts/count").json()["unreviewed_count"] == 2
    assert professional_client.get("/professionals/me/alerts?status=reviewed").json()["alerts"][0]["id"] == alert_id
    assert len(patient1_client.get("/readings/flags").json()) == 2


def test_filters_and_authorization(patient1_client, patient2_client, professional_client,
                                   professional2_client, db_session, users):
    first_id = users["patient1"].id
    second_id = users["patient2"].id
    assign_patient(db_session, users["professional"].id, first_id)
    assign_patient(db_session, users["professional"].id, second_id)
    patient1_client.post("/readings", json={"heart_rate": 101})
    patient2_client.post("/readings", json={"spo2": 94})
    all_alerts = professional_client.get("/professionals/me/alerts").json()["alerts"]
    assert len(all_alerts) == 2
    alert_id = next(item["id"] for item in all_alerts if item["patient_id"] == str(first_id))
    professional_client.patch(f"/professionals/me/alerts/{alert_id}/review")

    base = "/professionals/me/alerts"
    first = professional_client.get(f"{base}?patient_id={first_id}").json()
    assert [item["id"] for item in first["alerts"]] == [alert_id]
    assert first["unreviewed_count"] == 1  # Global count, unchanged by filters.
    assert professional_client.get(f"{base}?patient_id={first_id}&status=unreviewed").json()["alerts"] == []
    assert [item["id"] for item in professional_client.get(f"{base}?status=reviewed").json()["alerts"]] == [alert_id]
    assert len(professional_client.get(f"{base}?patient_id={second_id}&status=unreviewed").json()["alerts"]) == 1
    assert professional_client.get(f"{base}?status=invalid").status_code == 422
    assert professional2_client.get(base).json() == {"unreviewed_count": 0, "alerts": []}
    assert patient1_client.get(base).status_code == 403
    assert patient1_client.get(f"{base}/count").status_code == 403
    assert patient1_client.patch(f"{base}/{alert_id}/review").status_code == 403
    assert professional2_client.patch(f"{base}/{alert_id}/review").status_code == 404
    assert professional_client.patch(f"{base}/{uuid.uuid4()}/review").status_code == 404


def test_normal_rejected_and_failed_alert_write(patient1_client, professional_client,
                                                db_session, users, monkeypatch):
    assign_patient(db_session, users["professional"].id, users["patient1"].id)
    assert patient1_client.post("/readings", json={"heart_rate": 72}).status_code == 201
    assert patient1_client.post("/readings", json={"heart_rate": 300}).status_code == 422
    assert professional_client.get("/professionals/me/alerts/count").json()["unreviewed_count"] == 0

    def fail(*_args):
        raise RuntimeError("alert write failed")

    monkeypatch.setattr("app.alerts.queue_alerts", fail)
    with pytest.raises(RuntimeError, match="alert write failed"):
        patient1_client.post("/readings", json={"heart_rate": 101})
    assert db_session.scalar(select(func.count()).select_from(Reading)) == 1
    assert db_session.scalar(select(func.count()).select_from(ReadingEvaluation)) == 1
    assert db_session.scalar(select(func.count()).select_from(ProfessionalAlert)) == 0


def test_backfill_existing_flag_is_idempotent(db_session, users):
    row = Reading(
        patient_id=users["patient1"].id, vital_type="heart_rate", value=101,
        unit="bpm", recorded_at=readings.utcnow(), submission_id="before-alt-1", source="demo_seed",
    )
    db_session.add(row)
    db_session.flush()
    assess_readings(db_session, [row])
    db_session.commit()
    assign_patient(db_session, users["professional"].id, users["patient1"].id)

    assert backfill_alerts(db_session) == 1
    db_session.commit()
    assert backfill_alerts(db_session) == 0
    assert db_session.scalar(select(func.count()).select_from(ProfessionalAlert)) == 1
