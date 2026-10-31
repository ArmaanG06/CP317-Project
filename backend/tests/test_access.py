"""AUTH-2-T3: try direct URLs and requests for other patients' records.

Users (from conftest): patient1, patient2, professional (assigned to patient1 only), professional2.
"""

import uuid

import pytest

from app.access import PatientAssignment, assign_patient, can_access_patient, is_assigned

FULL = {"heart_rate": 72, "systolic": 120, "diastolic": 80, "temperature": 36.8, "spo2": 98}


def patient_url(patient_id):
    return f"/patients/{patient_id}/readings/latest"


@pytest.fixture
def assigned(db_session, users):
    """The professional is assigned to patient1."""
    assign_patient(db_session, users["professional"].id, users["patient1"].id)


# --- AUTH-2-T1: roles and assignments ---
def test_assign_patient_is_idempotent(db_session, users):
    first = assign_patient(db_session, users["professional"].id, users["patient1"].id)
    second = assign_patient(db_session, users["professional"].id, users["patient1"].id)
    assert first.id == second.id
    assert db_session.query(PatientAssignment).count() == 1


@pytest.mark.parametrize(
    "professional,patient",
    [
        ("patient2", "patient1"),  # a patient can't be the professional
        ("professional", "professional2"),  # a professional can't be assigned as a patient
    ],
)
def test_assign_patient_rejects_wrong_roles(db_session, users, professional, patient):
    with pytest.raises(ValueError):
        assign_patient(db_session, users[professional].id, users[patient].id)


def test_assign_patient_rejects_unknown_accounts(db_session, users):
    with pytest.raises(ValueError):
        assign_patient(db_session, users["professional"].id, uuid.uuid4())


def test_is_assigned(db_session, users, assigned):
    assert is_assigned(db_session, users["professional"].id, users["patient1"].id)
    assert not is_assigned(db_session, users["professional"].id, users["patient2"].id)
    assert not is_assigned(db_session, users["professional2"].id, users["patient1"].id)


@pytest.mark.parametrize(
    "who,patient,allowed",
    [
        ("patient1", "patient1", True),  # own record
        ("patient1", "patient2", False),  # another patient
        ("professional", "patient1", True),  # assigned
        ("professional", "patient2", False),  # not assigned
        ("professional2", "patient1", False),  # no assignments at all
    ],
)
def test_can_access_patient_rules(db_session, users, assigned, who, patient, allowed):
    assert can_access_patient(db_session, users[who], users[patient].id) is allowed


# --- AUTH-2-T2/T3: enforced on real requests ---
def test_patient_can_open_own_record_url(patient1_client, users):
    patient1_client.post("/readings", json=FULL)
    r = patient1_client.get(patient_url(users["patient1"].id))
    assert r.status_code == 200
    assert {row["vital_type"]: row["value"] for row in r.json()}["heart_rate"] == 72


def test_patient_cannot_open_another_patients_url(patient1_client, patient2_client, users):
    patient1_client.post("/readings", json=FULL)
    r = patient2_client.get(patient_url(users["patient1"].id))
    assert r.status_code == 403
    assert "heart_rate" not in r.text  # no data leaks in the error body


def test_assigned_professional_can_view_patient(patient1_client, professional_client, users, assigned):
    patient1_client.post("/readings", json=FULL)
    r = professional_client.get(patient_url(users["patient1"].id))
    assert r.status_code == 200
    assert {row["vital_type"]: row["value"] for row in r.json()}["spo2"] == 98


def test_professional_cannot_view_unassigned_patient(patient2_client, professional_client, users, assigned):
    patient2_client.post("/readings", json=FULL)
    assert professional_client.get(patient_url(users["patient2"].id)).status_code == 403


def test_other_professional_cannot_view_assigned_patient(professional2_client, users, assigned):
    assert professional2_client.get(patient_url(users["patient1"].id)).status_code == 403


def test_nonexistent_patient_id_denied(professional_client, assigned):
    # Guessing IDs must not reveal whether a patient exists.
    assert professional_client.get(patient_url(uuid.uuid4())).status_code == 403


@pytest.mark.parametrize("bad_id", ["abc", "1", "not-a-uuid"])
def test_malformed_patient_id_rejected(patient1_client, bad_id):
    assert patient1_client.get(patient_url(bad_id)).status_code == 422


def test_patient_cannot_use_professional_roster(patient1_client):
    assert patient1_client.get("/professionals/me/patients").status_code == 403


def test_query_string_cannot_switch_patient(patient1_client, patient2_client, users):
    # The patient ID always comes from the session, never from the request.
    patient1_client.post("/readings", json=FULL)
    r = patient2_client.get(f"/readings/latest?patient_id={users['patient1'].id}")
    assert r.status_code == 200
    assert all(row["available"] is False for row in r.json())
