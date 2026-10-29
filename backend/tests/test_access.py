"""AUTH-2-T3: try direct URLs and requests for other patients' records.

Users in these tests: patient 1, patient 2, professional 99 (assigned to patient 1 only), professional 98.
"""

import pytest

from app.access import PatientAssignment, assign_patient, can_access_patient, is_assigned
from app.deps import CurrentUser

FULL = {"heart_rate": 72, "systolic": 120, "diastolic": 80, "temperature": 36.8, "spo2": 98}
PATIENT_URL = "/patients/{}/readings/latest"


@pytest.fixture
def assigned(db_session):
    """Professional 99 is assigned to patient 1."""
    assign_patient(db_session, professional_id=99, patient_id=1)


# --- AUTH-2-T1: roles and assignments ---
def test_assign_patient_is_idempotent(db_session):
    first = assign_patient(db_session, 99, 1)
    second = assign_patient(db_session, 99, 1)
    assert first.id == second.id
    assert db_session.query(PatientAssignment).count() == 1


def test_is_assigned(db_session, assigned):
    assert is_assigned(db_session, 99, 1)
    assert not is_assigned(db_session, 99, 2)
    assert not is_assigned(db_session, 98, 1)


@pytest.mark.parametrize(
    "user,patient_id,allowed",
    [
        (CurrentUser(1, "patient"), 1, True),  # own record
        (CurrentUser(1, "patient"), 2, False),  # another patient
        (CurrentUser(99, "professional"), 1, True),  # assigned
        (CurrentUser(99, "professional"), 2, False),  # not assigned
        (CurrentUser(98, "professional"), 1, False),  # no assignments at all
    ],
)
def test_can_access_patient_rules(db_session, assigned, user, patient_id, allowed):
    assert can_access_patient(db_session, user, patient_id) is allowed


def test_unknown_role_denied(db_session, assigned):
    assert can_access_patient(db_session, CurrentUser(1, "admin"), 1) is False


# --- AUTH-2-T2/T3: enforced on real requests ---
def test_patient_can_open_own_record_url(patient1_client):
    patient1_client.post("/readings", json=FULL)
    r = patient1_client.get(PATIENT_URL.format(1))
    assert r.status_code == 200
    assert {row["vital_type"]: row["value"] for row in r.json()}["heart_rate"] == 72


def test_patient_cannot_open_another_patients_url(patient1_client, patient2_client):
    patient1_client.post("/readings", json=FULL)
    r = patient2_client.get(PATIENT_URL.format(1))
    assert r.status_code == 403
    assert "heart_rate" not in r.text  # no data leaks in the error body


def test_assigned_professional_can_view_patient(patient1_client, professional_client, assigned):
    patient1_client.post("/readings", json=FULL)
    r = professional_client.get(PATIENT_URL.format(1))
    assert r.status_code == 200
    assert {row["vital_type"]: row["value"] for row in r.json()}["spo2"] == 98


def test_professional_cannot_view_unassigned_patient(patient2_client, professional_client, assigned):
    patient2_client.post("/readings", json=FULL)
    r = professional_client.get(PATIENT_URL.format(2))
    assert r.status_code == 403


def test_other_professional_cannot_view_assigned_patient(professional2_client, assigned):
    assert professional2_client.get(PATIENT_URL.format(1)).status_code == 403


def test_nonexistent_patient_id_denied(professional_client, assigned):
    # Guessing IDs must not reveal whether a patient exists.
    assert professional_client.get(PATIENT_URL.format(12345)).status_code == 403


@pytest.mark.parametrize("bad_id", ["abc", "1.5", "-"])
def test_malformed_patient_id_rejected(patient1_client, bad_id):
    assert patient1_client.get(f"/patients/{bad_id}/readings/latest").status_code == 422


def test_patient_cannot_use_professional_roster(patient1_client):
    assert patient1_client.get("/professionals/me/patients").status_code == 403


def test_query_string_cannot_switch_patient(patient2_client, patient1_client):
    # The patient ID always comes from the session, never from the request.
    patient1_client.post("/readings", json=FULL)
    r = patient2_client.get("/readings/latest?patient_id=1")
    assert r.status_code == 200
    assert all(row["available"] is False for row in r.json())
