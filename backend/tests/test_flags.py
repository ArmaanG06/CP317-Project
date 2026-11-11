"""ALT-2: accepted readings keep their original threshold evaluation."""

import pytest
from sqlalchemy import func, select

from app import readings
from app.access import assign_patient
from app.readings import Reading
from app.thresholds import PatientAlertThreshold, ReadingEvaluation, assess_readings


def _payload(vital, value):
    if vital == "systolic":
        return {"systolic": value, "diastolic": 70}
    if vital == "diastolic":
        return {"systolic": 120, "diastolic": value}
    return {vital: value}


@pytest.mark.parametrize(
    "vital,low_out,low_equal,high_equal,high_out",
    [
        ("heart_rate", 59, 60, 100, 101),
        ("systolic", 89, 90, 139, 140),
        ("diastolic", 59, 60, 89, 90),
        ("temperature", 34.9, 35.0, 37.9, 38.0),
    ],
)
def test_both_threshold_edges(patient1_client, vital, low_out, low_equal, high_equal, high_out):
    for value, direction, limit in (
        (low_out, "below", low_equal),
        (low_equal, None, None),
        (high_equal, None, None),
        (high_out, "above", high_equal),
    ):
        response = patient1_client.post("/readings", json=_payload(vital, value))
        assert response.status_code == 201, response.json()
        row = next(row for row in response.json() if row["vital_type"] == vital)
        if direction:
            assert row["flag"]["direction"] == direction
            assert row["flag"]["breached_limit"] == limit
            assert row["flag"]["threshold_source"] == "default"
        else:
            assert row["flag"] is None


def test_spo2_lower_and_upper_edges(patient1_client):
    assert patient1_client.post("/readings", json={"spo2": 94}).json()[0]["flag"]["direction"] == "below"
    assert patient1_client.post("/readings", json={"spo2": 95}).json()[0]["flag"] is None
    assert patient1_client.post("/readings", json={"spo2": 100}).json()[0]["flag"] is None
    # Values above 100 are invalid input, not a high SpO2 alert.
    assert patient1_client.post("/readings", json={"spo2": 101}).status_code == 422


def test_bp_components_are_evaluated_separately(patient1_client, db_session):
    response = patient1_client.post("/readings", json={"systolic": 140, "diastolic": 59})
    assert response.status_code == 201
    rows = {row["vital_type"]: row for row in response.json()}
    assert rows["systolic"]["flag"]["direction"] == "above"
    assert rows["systolic"]["flag"]["breached_limit"] == 139
    assert rows["diastolic"]["flag"]["direction"] == "below"
    assert rows["diastolic"]["flag"]["breached_limit"] == 60
    assert db_session.scalar(select(func.count()).select_from(ReadingEvaluation)) == 2


def test_partial_submission_and_rejected_input(patient1_client, db_session):
    good = patient1_client.post("/readings", json={"heart_rate": 72})
    assert good.status_code == 201
    assert good.json()[0]["flag"] is None
    bad = patient1_client.post("/readings", json={"heart_rate": 300})
    assert bad.status_code == 422
    assert db_session.scalar(select(func.count()).select_from(Reading)) == 1
    assert db_session.scalar(select(func.count()).select_from(ReadingEvaluation)) == 1


def test_latest_history_and_flag_list_survive_reads(patient1_client, db_session):
    created = patient1_client.post("/readings", json={"heart_rate": 101})
    reading_id = created.json()[0]["id"]
    for _ in range(2):
        latest = {row["vital_type"]: row for row in patient1_client.get("/readings/latest").json()}
        assert latest["heart_rate"]["flag"]["breached_limit"] == 100
        assert [row["id"] for row in patient1_client.get("/readings/flags").json()] == [reading_id]
        history = patient1_client.get("/readings/history").json()["readings"]
        assert next(row for row in history if row["id"] == reading_id)["flag"]["direction"] == "above"
    assert db_session.scalar(select(func.count()).select_from(ReadingEvaluation)) == 1


def test_patient_override_is_snapshotted(patient1_client, patient2_client, db_session, users):
    db_session.add(PatientAlertThreshold(
        patient_id=users["patient1"].id, vital_type="heart_rate", lower_limit=50, upper_limit=80
    ))
    db_session.commit()

    old = patient1_client.post("/readings", json={"heart_rate": 85}).json()[0]
    assert old["flag"]["breached_limit"] == 80
    assert old["flag"]["threshold_source"] == "patient_override"
    assert patient2_client.post("/readings", json={"heart_rate": 85}).json()[0]["flag"] is None

    override = db_session.get(PatientAlertThreshold, (users["patient1"].id, "heart_rate"))
    override.upper_limit = 90
    db_session.commit()
    assert patient1_client.post("/readings", json={"heart_rate": 85}).json()[0]["flag"] is None
    prior = next(row for row in patient1_client.get("/readings/flags").json() if row["id"] == old["id"])
    assert prior["flag"]["breached_limit"] == 80
    assert prior["flag"]["upper_limit"] == 80


def test_assigned_professional_only(patient1_client, patient2_client, professional_client,
                                    professional2_client, db_session, users):
    reading_id = patient1_client.post("/readings", json={"temperature": 38.6}).json()[0]["id"]
    path = f"/patients/{users['patient1'].id}/readings/flags"
    assert patient2_client.get(path).status_code == 403
    assert professional_client.get(path).status_code == 403
    assert professional2_client.get(path).status_code == 403
    assign_patient(db_session, users["professional"].id, users["patient1"].id)
    assert [row["id"] for row in professional_client.get(path).json()] == [reading_id]
    assert [row["id"] for row in patient1_client.get(path).json()] == [reading_id]


def test_failed_evaluation_rolls_back_reading(patient1_client, db_session, monkeypatch):
    def fail(*_args):
        raise RuntimeError("evaluation failed")

    monkeypatch.setattr(readings, "assess_readings", fail)
    with pytest.raises(RuntimeError, match="evaluation failed"):
        patient1_client.post("/readings", json={"heart_rate": 101})
    assert db_session.scalar(select(func.count()).select_from(Reading)) == 0


def test_demo_evaluation_does_not_change_after_threshold_update(db_session, users):
    row = Reading(
        patient_id=users["patient1"].id, vital_type="heart_rate", value=101,
        unit="bpm", recorded_at=readings.utcnow(), submission_id="demo", source="demo_seed",
    )
    db_session.add(row)
    db_session.flush()
    assess_readings(db_session, [row])
    db_session.commit()
    original = db_session.get(ReadingEvaluation, row.id)
    assert original.direction == "above" and original.breached_limit == 100

    db_session.add(PatientAlertThreshold(
        patient_id=users["patient1"].id, vital_type="heart_rate", lower_limit=50, upper_limit=120
    ))
    db_session.commit()
    assert assess_readings(db_session, [row]) == []
    assert db_session.scalar(select(func.count()).select_from(ReadingEvaluation)) == 1
    assert db_session.get(ReadingEvaluation, row.id).breached_limit == 100
