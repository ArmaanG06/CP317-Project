"""AUTH-2: roles, professional-patient assignments, and server-side access checks.

Roles come from the signed-in user (`User.role`, set at login by AUTH-1).
Assignments link a health professional to the patients they are allowed to monitor.

Access rule (enforced on the server, never trusted from the frontend):
- a patient can only access their own records
- a professional can only access patients assigned to them
- anything else gets 403
"""

import uuid
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from sqlalchemy import DateTime, ForeignKey, UniqueConstraint, Uuid, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.db import Base, get_db
from app.deps import CurrentUser
from app.models import Role, User

# --- Roles (AUTH-2-T1) ---
# The roles themselves live on the users table (app.models.Role); these are shorthands.
ROLE_PATIENT = Role.patient
ROLE_PROFESSIONAL = Role.professional


# --- Model (AUTH-2-T1) ---
class PatientAssignment(Base):
    """One row per (professional, patient) pair the professional may monitor."""

    __tablename__ = "patient_assignments"
    __table_args__ = (UniqueConstraint("professional_id", "patient_id", name="uq_assignment_pair"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    professional_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


def assign_patient(db: Session, professional_id: uuid.UUID, patient_id: uuid.UUID) -> PatientAssignment:
    """Assign a patient to a professional. Safe to call twice; rejects wrong roles."""
    professional = db.get(User, professional_id)
    patient = db.get(User, patient_id)
    if professional is None or professional.role != ROLE_PROFESSIONAL:
        raise ValueError("Assignments need an existing professional account.")
    if patient is None or patient.role != ROLE_PATIENT:
        raise ValueError("Only patient accounts can be assigned.")

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


def is_assigned(db: Session, professional_id: uuid.UUID, patient_id: uuid.UUID) -> bool:
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
def can_access_patient(db: Session, user: User, patient_id: uuid.UUID) -> bool:
    if user.role == ROLE_PATIENT:
        return user.id == patient_id
    if user.role == ROLE_PROFESSIONAL:
        return is_assigned(db, user.id, patient_id)
    return False


def require_patient_access(patient_id: uuid.UUID, user: CurrentUser, db: Session = Depends(get_db)) -> User:
    """FastAPI dependency for any route with `{patient_id}` in its path."""
    if not can_access_patient(db, user, patient_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have access to this patient's records.")
    return user


def require_role(role: Role):
    """FastAPI dependency factory, e.g. `Depends(require_role(ROLE_PROFESSIONAL))`."""

    def check(user: CurrentUser) -> User:
        if user.role != role:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Only {role.value}s can use this feature.")
        return user

    return check
