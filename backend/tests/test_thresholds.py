"""THR-1: professionals configure limits for assigned patients only."""

from app.access import assign_patient
from app.thresholds import PatientAlertThreshold


def _url(patient, vital="heart_rate"):
    return f"/patients/{patient.id}/thresholds/{vital}"


def test_assigned_professional_sees_defaults_then_saves_custom_limit(professional_client, db_session, users):
    patient = users["patient1"]
    assign_patient(db_session, users["professional"].id, patient.id)

    listed = professional_client.get(f"/patients/{patient.id}/thresholds").json()
    assert {item["vital_type"] for item in listed} == {"heart_rate", "systolic", "diastolic", "temperature", "spo2"}
    assert all(item["source"] == "default" and item["updated_at"] is None for item in listed)

    response = professional_client.put(_url(patient), json={"lower": 50, "upper": 110.5})
    assert response.status_code == 200
    body = response.json()
    assert (body["lower"], body["upper"], body["source"]) == (50, 110.5, "patient_override")
    assert body["updated_by_name"] == "Dr. Test" and body["updated_at"]

    row = db_session.get(PatientAlertThreshold, (patient.id, "heart_rate"))
    assert row.updated_by == users["professional"].id and row.updated_at is not None
    other = next(i for i in professional_client.get(f"/patients/{patient.id}/thresholds").json()
                 if i["vital_type"] == "spo2")
    assert other["source"] == "default"  # only the edited vital changed


def test_only_assigned_professionals_can_manage_limits(patient1_client, professional_client,
                                                       professional2_client, db_session, users):
    patient = users["patient1"]
    assign_patient(db_session, users["professional"].id, patient.id)
    payload = {"lower": 50, "upper": 110}

    assert professional2_client.get(f"/patients/{patient.id}/thresholds").status_code == 403
    assert professional2_client.put(_url(patient), json=payload).status_code == 403
    assert professional2_client.delete(_url(patient)).status_code == 403
    assert patient1_client.get(f"/patients/{patient.id}/thresholds").status_code == 403
    assert patient1_client.put(_url(patient), json=payload).status_code == 403
    assert db_session.get(PatientAlertThreshold, (patient.id, "heart_rate")) is None


def test_invalid_limits_are_rejected_and_nothing_is_saved(professional_client, db_session, users):
    patient = users["patient1"]
    assign_patient(db_session, users["professional"].id, patient.id)
    for payload in (
        {"lower": 100, "upper": 60},      # low > high
        {"lower": 80, "upper": 80},       # low == high
        {"lower": "abc", "upper": 100},   # not a number
        {"lower": "60", "upper": 100},    # numeric string
        {"lower": True, "upper": 100},    # boolean
        {"lower": None, "upper": 100},
        {"upper": 100},
    ):
        response = professional_client.put(_url(patient), json=payload)
        assert response.status_code == 422, payload
    assert db_session.get(PatientAlertThreshold, (patient.id, "heart_rate")) is None
    assert professional_client.put(_url(patient, "pulse"), json={"lower": 1, "upper": 2}).status_code == 404


def test_new_limit_applies_to_future_readings_only(patient1_client, professional_client, db_session, users):
    patient = users["patient1"]
    assign_patient(db_session, users["professional"].id, patient.id)

    first = patient1_client.post("/readings", json={"heart_rate": 105})
    assert first.status_code == 201
    assert len(patient1_client.get("/readings/flags").json()) == 1  # above the default 100

    professional_client.put(_url(patient), json={"lower": 50, "upper": 120})

    assert patient1_client.post("/readings", json={"heart_rate": 105}).status_code == 201
    flags = patient1_client.get("/readings/flags").json()
    assert len(flags) == 1  # the new reading is within the custom limit; the old flag stays
    assert patient1_client.post("/readings", json={"heart_rate": 130}).status_code == 201
    assert len(patient1_client.get("/readings/flags").json()) == 2


def test_reset_restores_default_limit(professional_client, db_session, users):
    patient = users["patient1"]
    assign_patient(db_session, users["professional"].id, patient.id)
    professional_client.put(_url(patient), json={"lower": 50, "upper": 120})
    assert professional_client.delete(_url(patient)).status_code == 204
    assert professional_client.delete(_url(patient)).status_code == 204  # idempotent
    item = next(i for i in professional_client.get(f"/patients/{patient.id}/thresholds").json()
                if i["vital_type"] == "heart_rate")
    assert (item["lower"], item["upper"], item["source"]) == (60, 100, "default")
