"""TR_REP-1 (trends over a chosen period) and MON-2 (a professional's view of one patient's trends)."""

from datetime import datetime, timezone

import pytest

from app import readings
from app.access import assign_patient


def at(day, hour=12, minute=0):
    return datetime(2026, 11, day, hour, minute, tzinfo=timezone.utc)


def post_at(monkeypatch, client, when, payload):
    monkeypatch.setattr(readings, "utcnow", lambda: when)
    r = client.post("/readings", json=payload)
    assert r.status_code == 201, r.json()


def history(client, path="/readings/history", **params):
    return client.get(path, params=params)


def values(response):
    return [(row["vital_type"], row["value"]) for row in response.json()["readings"]]


def field_errors(response):
    assert response.status_code == 422
    return {e["field"]: e["message"] for e in response.json()["errors"]}


# --- History (TR_REP-1) ---
def test_history_empty(patient1_client):
    r = history(patient1_client, start="2026-11-01T00:00:00Z", end="2026-11-07T23:59:59Z")
    assert r.status_code == 200
    assert r.json() == {"start": "2026-11-01T00:00:00Z", "end": "2026-11-07T23:59:59Z", "readings": []}


def test_history_is_oldest_first_with_units(patient1_client, monkeypatch):
    post_at(monkeypatch, patient1_client, at(3), {"heart_rate": 80})
    post_at(monkeypatch, patient1_client, at(2), {"heart_rate": 70, "systolic": 120, "diastolic": 80})
    r = history(patient1_client, start="2026-11-01T00:00:00Z", end="2026-11-07T00:00:00Z")
    assert values(r) == [("heart_rate", 70), ("systolic", 120), ("diastolic", 80), ("heart_rate", 80)]
    assert [row["unit"] for row in r.json()["readings"]] == ["bpm", "mmHg", "mmHg", "bpm"]
    bp = [row for row in r.json()["readings"] if row["vital_type"] in ("systolic", "diastolic")]
    assert bp[0]["submission_id"] == bp[1]["submission_id"]  # BP halves stay linked


def test_period_boundaries_are_inclusive(patient1_client, monkeypatch):
    post_at(monkeypatch, patient1_client, at(1, 0, 0), {"heart_rate": 61})  # exactly at start
    post_at(monkeypatch, patient1_client, at(7, 23, 59), {"heart_rate": 62})  # exactly at end
    post_at(monkeypatch, patient1_client, at(8, 0, 0), {"heart_rate": 63})  # just after
    r = history(patient1_client, start="2026-11-01T00:00:00Z", end="2026-11-07T23:59:00Z")
    assert values(r) == [("heart_rate", 61), ("heart_rate", 62)]


def test_times_with_offsets_are_converted_to_utc(patient1_client, monkeypatch):
    post_at(monkeypatch, patient1_client, at(2, 4, 30), {"spo2": 97})
    # 2026-11-01 23:30 in Toronto (-05:00) is 2026-11-02 04:30 UTC.
    r = history(patient1_client, start="2026-11-01T23:30:00-05:00", end="2026-11-02T00:00:00-05:00")
    assert values(r) == [("spo2", 97)]
    assert r.json()["start"] == "2026-11-02T04:30:00Z"


def test_times_without_timezone_are_read_as_utc(patient1_client, monkeypatch):
    post_at(monkeypatch, patient1_client, at(2), {"spo2": 98})
    r = history(patient1_client, start="2026-11-02T12:00:00", end="2026-11-02T12:00:00")
    assert values(r) == [("spo2", 98)]


def test_default_period_is_last_30_days(patient1_client, monkeypatch):
    post_at(monkeypatch, patient1_client, datetime(2026, 10, 1, tzinfo=timezone.utc), {"heart_rate": 90})
    post_at(monkeypatch, patient1_client, datetime(2026, 11, 9, tzinfo=timezone.utc), {"heart_rate": 72})
    monkeypatch.setattr(readings, "utcnow", lambda: datetime(2026, 11, 10, tzinfo=timezone.utc))
    r = history(patient1_client)
    assert values(r) == [("heart_rate", 72)]
    assert r.json()["start"] == "2026-10-11T00:00:00Z"
    assert r.json()["end"] == "2026-11-10T00:00:00Z"


@pytest.mark.parametrize(
    "params,errors",
    [
        ({"start": "last tuesday"}, {"start": "Enter the start as a date and time, like 2026-11-01T00:00:00Z."}),
        ({"end": "2026-13-01"}, {"end": "Enter the end as a date and time, like 2026-11-01T00:00:00Z."}),
        (
            {"start": "2026-11-07T00:00:00Z", "end": "2026-11-01T00:00:00Z"},
            {None: "The start of the time period must be before the end."},
        ),
        (
            {"start": "2025-01-01T00:00:00Z", "end": "2026-11-01T00:00:00Z"},
            {None: "Choose a time period of 366 days or less."},
        ),
    ],
)
def test_invalid_period_rejected(patient1_client, params, errors):
    assert field_errors(history(patient1_client, **params)) == errors


# --- Access ---
def test_patient_history_only_shows_own_readings(patient1_client, patient2_client, monkeypatch):
    post_at(monkeypatch, patient1_client, at(2), {"heart_rate": 70})
    r = history(patient2_client, start="2026-11-01T00:00:00Z", end="2026-11-07T00:00:00Z")
    assert r.json()["readings"] == []


def test_professionals_cannot_use_patient_history_endpoint(professional_client):
    assert history(professional_client).status_code == 403


# --- Professional view of one patient (MON-2) ---
def test_assigned_professional_sees_patient_history(patient1_client, professional_client, db_session, users, monkeypatch):
    assign_patient(db_session, users["professional"].id, users["patient1"].id)
    post_at(monkeypatch, patient1_client, at(2), {"temperature": 37.1})
    r = history(
        professional_client,
        f"/patients/{users['patient1'].id}/readings/history",
        start="2026-11-01T00:00:00Z",
        end="2026-11-07T00:00:00Z",
    )
    assert r.status_code == 200
    assert values(r) == [("temperature", 37.1)]


def test_switching_patients_returns_each_patients_own_history(
    patient1_client, patient2_client, professional_client, db_session, users, monkeypatch
):
    for key in ("patient1", "patient2"):
        assign_patient(db_session, users["professional"].id, users[key].id)
    post_at(monkeypatch, patient1_client, at(2), {"heart_rate": 61})
    post_at(monkeypatch, patient2_client, at(2), {"heart_rate": 99})
    period = {"start": "2026-11-01T00:00:00Z", "end": "2026-11-07T00:00:00Z"}
    first = history(professional_client, f"/patients/{users['patient1'].id}/readings/history", **period)
    second = history(professional_client, f"/patients/{users['patient2'].id}/readings/history", **period)
    assert values(first) == [("heart_rate", 61)]
    assert values(second) == [("heart_rate", 99)]


def test_unassigned_professional_is_denied_without_data(patient1_client, professional_client, users, monkeypatch):
    post_at(monkeypatch, patient1_client, at(2), {"heart_rate": 70})
    r = history(professional_client, f"/patients/{users['patient1'].id}/readings/history")
    assert r.status_code == 403
    assert "readings" not in r.json()


def test_patient_can_use_own_id_but_not_others(patient1_client, users):
    assert history(patient1_client, f"/patients/{users['patient1'].id}/readings/history").status_code == 200
    assert history(patient1_client, f"/patients/{users['patient2'].id}/readings/history").status_code == 403
