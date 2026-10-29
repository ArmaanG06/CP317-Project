"""AUTH-2: roles, professional-patient assignments, and server-side access checks.

Roles come from the signed-in user (`CurrentUser.role`, set by AUTH-1's login).
Assignments link a health professional to the patients they are allowed to monitor.

Access rule (enforced on the server, never trusted from the frontend):
- a patient can only access their own records
- a professional can only access patients assigned to them
- anything else gets 403
"""

from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from sqlalchemy import DateTime, Integer, UniqueConstraint, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.db import Base, get_db
from app.deps import CurrentUser, get_current_user

# --- Roles (AUTH-2-T1) ---
ROLE_PATIENT = "patient"
ROLE_PROFESSIONAL = "professional"
ROLES = (ROLE_PATIENT, ROLE_PROFESSIONAL)


# --- Model (AUTH-2-T1) ---
class PatientAssignment(Base):
    """One row per (professional, patient) pair the professional may monitor."""

    __tablename__ = "patient_assignments"
    __table_args__ = (UniqueConstraint("professional_id", "patient_id", name="uq_assignment_pair"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # TODO: FKs to the users table once AUTH-1's schema lands
    professional_id: Mapped[int] = mapped_column(Integer, index=True)
    patient_id: Mapped[int] = mapped_column(Integer, index=True)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


def assign_patient(db: Session, professional_id: int, patient_id: int) -> PatientAssignment:
    """Create an assignment, or return the existing one (safe to call twice)."""
    existing = db.scalar(
        select(PatientAssignment).where(
            PatientAssignment.professional_id == professional_id,
            PatientAssignment.patient_id == patient_id,
        )
    )
    if existing:
        return existing
    row = PatientAssignment(
        professional_id=professional_id, patient_id=patient_id, assigned_at=datetime.now(timezone.utc)
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def is_assigned(db: Session, professional_id: int, patient_id: int) -> bool:
    return (
        db.scalar(
            select(PatientAssignment.id).where(
                PatientAssignment.professional_id == professional_id,
                PatientAssignment.patient_id == patient_id,
            )
        )
        is not None
    )


# --- Checks (AUTH-2-T2) ---
def can_access_patient(db: Session, user: CurrentUser, patient_id: int) -> bool:
    if user.role == ROLE_PATIENT:
        return user.id == patient_id
    if user.role == ROLE_PROFESSIONAL:
        return is_assigned(db, user.id, patient_id)
    return False


def require_patient_access(
    patient_id: int,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CurrentUser:
    """FastAPI dependency for any route with `{patient_id}` in its path."""
    if not can_access_patient(db, user, patient_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have access to this patient's records.")
    return user


def require_role(role: str):
    """FastAPI dependency factory, e.g. `Depends(require_role(ROLE_PROFESSIONAL))`."""

    def check(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role != role:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Only {role}s can use this feature.")
        return user

    return check
