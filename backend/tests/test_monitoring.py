"""MON-1: assigned-patient roster and links to the right patient dashboard."""

from datetime import datetime, timedelta

from app.access import assign_patient


def test_roster_empty_when_nothing_assigned(professional_client):
    r = professional_client.get("/professionals/me/patients")
    assert r.status_code == 200
    assert r.json() == []


def test_roster_lists_only_my_patients(professional_client, professional2_client, db_session, users):
    assign_patient(db_session, users["professional"].id, users["patient1"].id)
    assign_patient(db_session, users["professional"].id, users["patient2"].id)
    assign_patient(db_session, users["professional2"].id, users["patient2"].id)

    mine = professional_client.get("/professionals/me/patients").json()
    assert [row["full_name"] for row in mine] == ["Daniel Okafor", "Maya Chen"]  # sorted by name

    theirs = professional2_client.get("/professionals/me/patients").json()
    assert [row["patient_id"] for row in theirs] == [str(users["patient2"].id)]


def test_roster_entries_link_to_correct_dashboard(professional_client, db_session, users):
    patient_id = users["patient1"].id
    assign_patient(db_session, users["professional"].id, patient_id)
    entry = professional_client.get("/professionals/me/patients").json()[0]
    assert entry["patient_id"] == str(patient_id)
    assert entry["dashboard_path"] == f"/patients/{patient_id}"
    assert datetime.fromisoformat(entry["assigned_at"]).utcoffset() == timedelta(0)


def test_roster_link_opens_that_patients_data(patient1_client, professional_client, db_session, users):
    assign_patient(db_session, users["professional"].id, users["patient1"].id)
    patient1_client.post("/readings", json={"heart_rate": 64})

    entry = professional_client.get("/professionals/me/patients").json()[0]
    r = professional_client.get(f"{entry['dashboard_path']}/readings/latest")
    assert r.status_code == 200
    assert {row["vital_type"]: row["value"] for row in r.json()}["heart_rate"] == 64


def test_assigned_patient_with_no_readings_shows_empty_state(professional_client, db_session, users):
    assign_patient(db_session, users["professional"].id, users["patient2"].id)
    r = professional_client.get(f"/patients/{users['patient2'].id}/readings/latest")
    assert r.status_code == 200
    assert all(row["message"] == "No reading available" for row in r.json())
