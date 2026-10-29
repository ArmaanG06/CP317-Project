"""MON-1: assigned-patient roster and links to the right patient dashboard."""

from datetime import datetime, timedelta

from app.access import assign_patient


def test_roster_empty_when_nothing_assigned(professional_client):
    r = professional_client.get("/professionals/me/patients")
    assert r.status_code == 200
    assert r.json() == []


def test_roster_lists_only_my_patients(professional_client, professional2_client, db_session):
    assign_patient(db_session, 99, 3)
    assign_patient(db_session, 99, 1)
    assign_patient(db_session, 98, 2)  # someone else's patient

    r = professional_client.get("/professionals/me/patients")
    assert r.status_code == 200
    assert [row["patient_id"] for row in r.json()] == [1, 3]  # sorted, no patient 2

    other = professional2_client.get("/professionals/me/patients").json()
    assert [row["patient_id"] for row in other] == [2]


def test_roster_entries_link_to_correct_dashboard(professional_client, db_session):
    assign_patient(db_session, 99, 7)
    entry = professional_client.get("/professionals/me/patients").json()[0]
    assert entry["dashboard_path"] == "/patients/7"
    assert datetime.fromisoformat(entry["assigned_at"]).utcoffset() == timedelta(0)


def test_roster_link_opens_that_patients_data(patient1_client, professional_client, db_session):
    assign_patient(db_session, 99, 1)
    patient1_client.post("/readings", json={"heart_rate": 64})

    entry = professional_client.get("/professionals/me/patients").json()[0]
    r = professional_client.get(f"{entry['dashboard_path']}/readings/latest")
    assert r.status_code == 200
    assert {row["vital_type"]: row["value"] for row in r.json()}["heart_rate"] == 64


def test_assigned_patient_with_no_readings_shows_empty_state(professional_client, db_session):
    assign_patient(db_session, 99, 5)
    r = professional_client.get("/patients/5/readings/latest")
    assert r.status_code == 200
    assert all(row["message"] == "No reading available" for row in r.json())
