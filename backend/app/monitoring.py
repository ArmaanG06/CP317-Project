"""MON-1: a professional's roster of assigned patients, and per-patient views it links to.

GET /professionals/me/patients        roster for the signed-in professional (MON-1-T1)
GET /patients/{patient_id}/readings/latest
                                      a patient's latest vitals; the roster links here (MON-1-T2).
                                      Protected by AUTH-2: the patient themselves or an assigned professional.
"""

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.access import ROLE_PROFESSIONAL, PatientAssignment, require_patient_access, require_role
from app.db import get_db
from app.models import User
from app.readings import LatestReading, UTCDatetime, get_latest


def patient_dashboard_path(patient_id: uuid.UUID) -> str:
    """Frontend route for a patient's dashboard. Keep in sync with the React router."""
    return f"/professional/patients/{patient_id}"


# --- Schemas ---
class RosterEntry(BaseModel):
    patient_id: uuid.UUID
    full_name: str
    assigned_at: UTCDatetime
    dashboard_path: str


# --- Logic ---
def get_roster(db: Session, professional_id: uuid.UUID) -> list[RosterEntry]:
    rows = db.execute(
        select(PatientAssignment, User.full_name)
        .join(User, User.id == PatientAssignment.patient_id)
        .where(PatientAssignment.professional_id == professional_id)
        .order_by(User.full_name)
    )
    return [
        RosterEntry(
            patient_id=assignment.patient_id,
            full_name=full_name,
            assigned_at=assignment.assigned_at,
            dashboard_path=patient_dashboard_path(assignment.patient_id),
        )
        for assignment, full_name in rows
    ]


# --- Routes ---
router = APIRouter(tags=["monitoring"])


@router.get("/professionals/me/patients", response_model=list[RosterEntry])
def my_patients(user: User = Depends(require_role(ROLE_PROFESSIONAL)), db: Session = Depends(get_db)):
    # Empty list (not 404) when nothing is assigned, so the UI can show its empty state.
    return get_roster(db, user.id)


@router.get("/patients/{patient_id}/readings/latest", response_model=list[LatestReading])
def patient_latest_readings(
    patient_id: uuid.UUID,
    _user: User = Depends(require_patient_access),
    db: Session = Depends(get_db),
):
    return get_latest(db, patient_id)
