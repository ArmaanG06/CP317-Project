from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select

from app import readings
from app.readings import VITAL_LIMITS, VITAL_ORDER, Reading

FULL = {"heart_rate": 72, "systolic": 120, "diastolic": 80, "temperature": 36.8, "spo2": 98}


def payload_with(vital, value):
    """Build a valid payload containing `vital`, pairing BP halves with a valid partner."""
    if vital == "systolic":
        return {"systolic": value, "diastolic": VITAL_LIMITS["diastolic"]["min"]}
    if vital == "diastolic":
        return {"systolic": VITAL_LIMITS["systolic"]["max"], "diastolic": value}
    return {vital: value}


def step(vital):
    return 0.1 if vital == "temperature" else 1


def row_count(db_session):
    return db_session.scalar(select(func.count()).select_from(Reading))


def messages(response):
    return [e["message"] for e in response.json()["errors"]]


# --- Validation ---
@pytest.mark.parametrize("vital", VITAL_ORDER)
@pytest.mark.parametrize("bound", ["min", "max"])
def test_limit_boundaries_accepted(patient1_client, vital, bound):
    r = patient1_client.post("/readings", json=payload_with(vital, VITAL_LIMITS[vital][bound]))
    assert r.status_code == 201, r.json()


@pytest.mark.parametrize("vital", VITAL_ORDER)
@pytest.mark.parametrize("bound,direction", [("min", -1), ("max", 1)])
def test_just_outside_limits_rejected(patient1_client, vital, bound, direction):
    limits = VITAL_LIMITS[vital]
    value = round(limits[bound] + direction * step(vital), 1)
    r = patient1_client.post("/readings", json=payload_with(vital, value))
    assert r.status_code == 422
    expected = f"{limits['label']} must be between {limits['min']} and {limits['max']} {limits['unit']}."
    assert {"field": vital, "message": expected} in r.json()["errors"]


@pytest.mark.parametrize("payload", [{"systolic": 120}, {"diastolic": 80}])
def test_missing_bp_half_rejected(patient1_client, payload):
    r = patient1_client.post("/readings", json=payload)
    assert r.status_code == 422
    assert "Enter both systolic and diastolic blood pressure." in messages(r)


@pytest.mark.parametrize("systolic,diastolic", [(80, 80), (80, 90)])
def test_systolic_not_above_diastolic_rejected(patient1_client, systolic, diastolic):
    r = patient1_client.post("/readings", json={"systolic": systolic, "diastolic": diastolic})
    assert r.status_code == 422
    assert "Systolic pressure must be greater than diastolic pressure." in messages(r)


@pytest.mark.parametrize("payload", [{}, {"heart_rate": None}])
def test_empty_payload_rejected(patient1_client, payload):
    r = patient1_client.post("/readings", json=payload)
    assert r.status_code == 422
    assert r.json()["errors"] == [{"field": None, "message": "Enter at least one vital sign."}]


@pytest.mark.parametrize("value", ["72", True, "abc"])
def test_non_numeric_rejected(patient1_client, value):
    r = patient1_client.post("/readings", json={"heart_rate": value})
    assert r.status_code == 422
    assert r.json()["errors"] == [{"field": "heart_rate", "message": "Heart rate must be a number."}]


@pytest.mark.parametrize("literal", ["NaN", "Infinity", "-Infinity"])
def test_nan_and_inf_rejected(patient1_client, literal):
    r = patient1_client.post(
        "/readings", content=f'{{"temperature": {literal}}}', headers={"Content-Type": "application/json"}
    )
    assert r.status_code == 422
    assert r.json()["errors"] == [{"field": "temperature", "message": "Temperature must be a number."}]


def test_unknown_field_rejected(patient1_client):
    r = patient1_client.post("/readings", json={"heart_rate": 72, "weight": 70})
    assert r.status_code == 422
    assert r.json()["errors"] == [{"field": "weight", "message": "Unknown field: weight."}]


def test_decimal_heart_rate_rejected(patient1_client):
    r = patient1_client.post("/readings", json={"heart_rate": 72.5})
    assert r.status_code == 422
    assert r.json()["errors"] == [{"field": "heart_rate", "message": "Heart rate must be a whole number."}]


def test_temperature_one_decimal_accepted(patient1_client):
    r = patient1_client.post("/readings", json={"temperature": 37.5})
    assert r.status_code == 201
    assert r.json()[0]["value"] == 37.5


def test_temperature_two_decimals_rejected(patient1_client):
    r = patient1_client.post("/readings", json={"temperature": 37.55})
    assert r.status_code == 422
    assert "Temperature can have at most 1 decimal place." in messages(r)


# --- Save ---
def test_save_full_submission(patient1_client, db_session):
    r = patient1_client.post("/readings", json=FULL)
    assert r.status_code == 201
    body = r.json()
    assert [row["vital_type"] for row in body] == VITAL_ORDER
    assert {row["value"] for row in body} == {72, 120, 80, 36.8, 98}
    assert len({row["submission_id"] for row in body}) == 1
    assert len({row["recorded_at"] for row in body}) == 1
    for row in body:
        assert datetime.fromisoformat(row["recorded_at"]).utcoffset() == timedelta(0)
        assert row["source"] == "patient_entered"
        assert row["unit"] == VITAL_LIMITS[row["vital_type"]]["unit"]

    rows = db_session.scalars(select(Reading)).all()
    assert len(rows) == 5
    assert {row.patient_id for row in rows} == {1}


def test_save_heart_rate_only(patient1_client, db_session):
    r = patient1_client.post("/readings", json={"heart_rate": 60})
    assert r.status_code == 201
    assert len(r.json()) == 1
    assert r.json()[0]["vital_type"] == "heart_rate"
    assert row_count(db_session) == 1


def test_invalid_submission_saves_nothing(patient1_client, db_session):
    r = patient1_client.post("/readings", json={**FULL, "heart_rate": 300})
    assert r.status_code == 422
    errors = r.json()["errors"]
    assert errors and all(set(e) == {"field", "message"} for e in errors)
    assert row_count(db_session) == 0


# --- Latest ---
def at(minutes):
    return lambda: datetime(2026, 1, 1, 12, minutes, tzinfo=timezone.utc)


def latest_by_vital(client):
    r = client.get("/readings/latest")
    assert r.status_code == 200
    return {row["vital_type"]: row for row in r.json()}


def test_latest_with_no_data(patient1_client):
    r = patient1_client.get("/readings/latest")
    assert r.status_code == 200
    body = r.json()
    assert [row["vital_type"] for row in body] == VITAL_ORDER
    for row in body:
        assert row["available"] is False
        assert row["value"] is None
        assert row["recorded_at"] is None
        assert row["message"] == "No reading available"


def test_latest_returns_newer_submission(patient1_client, monkeypatch):
    monkeypatch.setattr(readings, "utcnow", at(0))
    patient1_client.post("/readings", json=FULL)
    monkeypatch.setattr(readings, "utcnow", at(30))
    newer = {"heart_rate": 90, "systolic": 130, "diastolic": 85, "temperature": 37.2, "spo2": 95}
    patient1_client.post("/readings", json=newer)

    latest = latest_by_vital(patient1_client)
    for name, value in newer.items():
        assert latest[name]["value"] == value
        assert latest[name]["available"] is True
        assert latest[name]["message"] is None
        assert datetime.fromisoformat(latest[name]["recorded_at"]) == at(30)()


def test_latest_mixes_partial_newer_submission(patient1_client, monkeypatch):
    monkeypatch.setattr(readings, "utcnow", at(0))
    patient1_client.post("/readings", json=FULL)
    monkeypatch.setattr(readings, "utcnow", at(30))
    patient1_client.post("/readings", json={"heart_rate": 101})

    latest = latest_by_vital(patient1_client)
    assert latest["heart_rate"]["value"] == 101
    assert datetime.fromisoformat(latest["heart_rate"]["recorded_at"]) == at(30)()
    for name in ["systolic", "diastolic", "temperature", "spo2"]:
        assert latest[name]["value"] == FULL[name]
        assert datetime.fromisoformat(latest[name]["recorded_at"]) == at(0)()


# --- Access ---
def test_patient_cannot_see_other_patients_readings(patient1_client, patient2_client):
    assert patient1_client.post("/readings", json=FULL).status_code == 201
    assert latest_by_vital(patient1_client)["heart_rate"]["available"] is True

    latest = latest_by_vital(patient2_client)
    assert all(row["available"] is False for row in latest.values())


def test_professional_forbidden(professional_client, db_session):
    r = professional_client.post("/readings", json=FULL)
    assert r.status_code == 403
    assert row_count(db_session) == 0
    assert professional_client.get("/readings/latest").status_code == 403
