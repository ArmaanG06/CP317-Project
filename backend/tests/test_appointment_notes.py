"""Session notes on appointments (Figma frames 17–20): professionals write them, patients read published ones."""

from datetime import datetime, timedelta, timezone

import pytest

from app.access import assign_patient
from app.appointments import AppointmentBooking, AppointmentSlot


def make_visit(db, users, *, days=-7, patient="patient1", professional="professional", cancelled=False):
    """A visit `days` from now (negative = in the past), booked by `patient` with `professional`."""
    assign_patient(db, users[professional].id, users[patient].id)
    start = datetime.now(timezone.utc) + timedelta(days=days)
    slot = AppointmentSlot(
        professional_id=users[professional].id, starts_at=start, ends_at=start + timedelta(minutes=30), location="Clinic A"
    )
    db.add(slot)
    db.flush()
    booking = AppointmentBooking(
        slot_id=slot.id, patient_id=users[patient].id, reason="Follow-up",
        cancelled_at=start - timedelta(days=1) if cancelled else None,
    )
    db.add(booking)
    db.commit()
    return booking.id


def notes(client, booking_id, **body):
    return client.put(f"/appointments/bookings/{booking_id}/notes", json=body)


# --- Writing notes (professional) ---
def test_draft_notes_are_hidden_from_the_patient(professional_client, patient1_client, db_session, users):
    visit = make_visit(db_session, users)
    r = notes(professional_client, visit, shared_notes="Summary: steady readings.", internal_notes="Ask about sleep.")
    assert r.status_code == 200
    assert r.json()["shared_notes"] == "Summary: steady readings."
    assert r.json()["notes_published"] is False and r.json()["has_draft_notes"] is True

    seen = patient1_client.get(f"/appointments/bookings/{visit}").json()
    assert seen["shared_notes"] is None and seen["internal_notes"] is None and seen["notes_published"] is False


def test_published_notes_reach_the_patient_but_internal_notes_never_do(
    professional_client, patient1_client, db_session, users
):
    visit = make_visit(db_session, users)
    notes(professional_client, visit, internal_notes="Check device model.")
    r = notes(professional_client, visit, shared_notes="Plan: record each morning.", publish=True)
    assert r.json()["notes_published"] is True and r.json()["notes_published_at"]

    seen = patient1_client.get(f"/appointments/bookings/{visit}").json()
    assert seen["shared_notes"] == "Plan: record each morning."
    assert seen["internal_notes"] is None
    assert seen["professional_name"] == "Dr. Test"
    listed = {b["id"]: b for b in patient1_client.get("/appointments").json()}
    assert listed[str(visit)]["notes_published"] is True and listed[str(visit)]["status"] == "completed"


def test_editing_published_notes_returns_them_to_draft(professional_client, patient1_client, db_session, users):
    visit = make_visit(db_session, users)
    notes(professional_client, visit, shared_notes="First version.", publish=True)
    r = notes(professional_client, visit, shared_notes="Second version.")
    assert r.json()["notes_published"] is False
    assert patient1_client.get(f"/appointments/bookings/{visit}").json()["shared_notes"] is None


def test_saving_internal_notes_keeps_shared_notes_published(professional_client, db_session, users):
    visit = make_visit(db_session, users)
    notes(professional_client, visit, shared_notes="Shared.", publish=True)
    r = notes(professional_client, visit, internal_notes="Private.")
    assert r.json()["notes_published"] is True and r.json()["internal_notes"] == "Private."


@pytest.mark.parametrize(
    "body,message",
    [
        ({}, "Enter notes to save."),
        ({"shared_notes": "   ", "publish": True}, "Write notes for the patient before publishing them."),
    ],
)
def test_invalid_notes_rejected(professional_client, db_session, users, body, message):
    visit = make_visit(db_session, users)
    r = notes(professional_client, visit, **body)
    assert r.status_code == 422
    assert r.json()["errors"][0]["message"] == message


def test_notes_need_a_visit_that_has_started_and_was_not_cancelled(professional_client, db_session, users):
    future = make_visit(db_session, users, days=3)
    assert notes(professional_client, future, shared_notes="x").status_code == 409
    cancelled = make_visit(db_session, users, days=-3, patient="patient2", cancelled=True)
    assert notes(professional_client, cancelled, shared_notes="x").status_code == 409


# --- Access ---
def test_patients_cannot_write_notes(patient1_client, db_session, users):
    visit = make_visit(db_session, users)
    assert notes(patient1_client, visit, shared_notes="x").status_code == 403


def test_other_professionals_and_patients_cannot_see_the_visit(
    professional2_client, patient2_client, db_session, users
):
    visit = make_visit(db_session, users)
    assert professional2_client.get(f"/appointments/bookings/{visit}").status_code == 404
    assert notes(professional2_client, visit, shared_notes="x").status_code == 404
    assert patient2_client.get(f"/appointments/bookings/{visit}").status_code == 404


def test_professional_list_shows_patient_ids_for_linking(professional_client, db_session, users):
    visit = make_visit(db_session, users)
    row = next(b for b in professional_client.get("/appointments").json() if b["id"] == str(visit))
    assert row["patient_id"] == str(users["patient1"].id)
