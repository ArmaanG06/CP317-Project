"""ALT-1: per-professional review records for flagged measurements."""

import uuid
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import DateTime, ForeignKey, Integer, Uuid, UniqueConstraint, func, select, update
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.access import ROLE_PROFESSIONAL, PatientAssignment, require_role
from app.db import Base, get_db
from app.models import User
from app.readings import Reading, UTCDatetime
from app.thresholds import ReadingEvaluation


class ProfessionalAlert(Base):
    """A recipient's review state; the reading and its flag remain unchanged."""

    __tablename__ = "professional_alerts"
    __table_args__ = (UniqueConstraint("reading_id", "professional_id", name="uq_alert_reading_recipient"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    reading_id: Mapped[int] = mapped_column(Integer, ForeignKey("readings.id", ondelete="CASCADE"), index=True)
    professional_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AlertOut(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    patient_name: str
    vital_type: str
    value: float
    unit: str
    recorded_at: UTCDatetime
    direction: str
    breached_limit: float
    lower_limit: float
    upper_limit: float
    threshold_source: str
    reviewed_at: UTCDatetime | None


class AlertList(BaseModel):
    # Count is across all assigned patients, independent of the list filters.
    unreviewed_count: int
    alerts: list[AlertOut]


class AlertCount(BaseModel):
    unreviewed_count: int


class ReviewOut(BaseModel):
    id: uuid.UUID
    reviewed_at: UTCDatetime


def queue_alerts(db: Session, readings: list[Reading], evaluations: list[ReadingEvaluation]) -> None:
    """Add recipients of new flags in the caller's reading transaction."""
    flagged_ids = {item.reading_id for item in evaluations if item.direction is not None}
    if not flagged_ids:
        return
    patients = {row.patient_id for row in readings if row.id in flagged_ids}
    assignments = db.scalars(select(PatientAssignment).where(PatientAssignment.patient_id.in_(patients)))
    by_patient: dict[uuid.UUID, list[uuid.UUID]] = {}
    for assignment in assignments:
        by_patient.setdefault(assignment.patient_id, []).append(assignment.professional_id)
    for row in readings:
        if row.id in flagged_ids:
            for recipient in by_patient.get(row.patient_id, []):
                db.add(ProfessionalAlert(reading_id=row.id, professional_id=recipient))


def backfill_alerts(db: Session) -> int:
    """Idempotent migration for flags saved before ALT-1; caller commits."""
    missing = db.execute(
        select(Reading.id, PatientAssignment.professional_id)
        .join(ReadingEvaluation, ReadingEvaluation.reading_id == Reading.id)
        .join(PatientAssignment, PatientAssignment.patient_id == Reading.patient_id)
        .outerjoin(
            ProfessionalAlert,
            (ProfessionalAlert.reading_id == Reading.id)
            & (ProfessionalAlert.professional_id == PatientAssignment.professional_id),
        )
        .where(ReadingEvaluation.direction.is_not(None), ProfessionalAlert.id.is_(None))
    )
    new = [ProfessionalAlert(reading_id=reading_id, professional_id=professional_id)
           for reading_id, professional_id in missing]
    db.add_all(new)
    return len(new)


def unreviewed_count(db: Session, professional_id: uuid.UUID) -> int:
    return db.scalar(
        select(func.count()).select_from(ProfessionalAlert).where(
            ProfessionalAlert.professional_id == professional_id,
            ProfessionalAlert.reviewed_at.is_(None),
        )
    )


def list_alerts(db: Session, professional_id: uuid.UUID, patient_id: uuid.UUID | None,
                review_status: Literal["all", "unreviewed", "reviewed"]) -> AlertList:
    query = (
        select(ProfessionalAlert, Reading, ReadingEvaluation, User.full_name)
        .join(Reading, Reading.id == ProfessionalAlert.reading_id)
        .join(ReadingEvaluation, ReadingEvaluation.reading_id == Reading.id)
        .join(User, User.id == Reading.patient_id)
        .where(ProfessionalAlert.professional_id == professional_id)
    )
    if patient_id is not None:
        query = query.where(Reading.patient_id == patient_id)
    if review_status == "unreviewed":
        query = query.where(ProfessionalAlert.reviewed_at.is_(None))
    elif review_status == "reviewed":
        query = query.where(ProfessionalAlert.reviewed_at.is_not(None))
    rows = db.execute(query.order_by(Reading.recorded_at.desc(), Reading.id.desc()))
    alerts = [
        AlertOut(
            id=alert.id, patient_id=reading.patient_id, patient_name=name,
            vital_type=reading.vital_type, value=reading.value, unit=reading.unit,
            recorded_at=reading.recorded_at, direction=evaluation.direction,
            breached_limit=evaluation.breached_limit, lower_limit=evaluation.lower_limit,
            upper_limit=evaluation.upper_limit, threshold_source=evaluation.threshold_source,
            reviewed_at=alert.reviewed_at,
        )
        for alert, reading, evaluation, name in rows
    ]
    return AlertList(unreviewed_count=unreviewed_count(db, professional_id), alerts=alerts)


router = APIRouter(prefix="/professionals/me/alerts", tags=["alerts"])


@router.get("", response_model=AlertList)
def my_alerts(
    user: User = Depends(require_role(ROLE_PROFESSIONAL)),
    patient_id: uuid.UUID | None = None,
    review_status: Annotated[Literal["all", "unreviewed", "reviewed"], Query(alias="status")] = "all",
    db: Session = Depends(get_db),
):
    return list_alerts(db, user.id, patient_id, review_status)


@router.get("/count", response_model=AlertCount)
def my_alert_count(user: User = Depends(require_role(ROLE_PROFESSIONAL)), db: Session = Depends(get_db)):
    return AlertCount(unreviewed_count=unreviewed_count(db, user.id))


@router.patch("/{alert_id}/review", response_model=ReviewOut)
def mark_reviewed(
    alert_id: uuid.UUID,
    user: User = Depends(require_role(ROLE_PROFESSIONAL)),
    db: Session = Depends(get_db),
):
    reviewed_at = datetime.now(timezone.utc)
    try:
        db.execute(
            update(ProfessionalAlert)
            .where(
                ProfessionalAlert.id == alert_id,
                ProfessionalAlert.professional_id == user.id,
                ProfessionalAlert.reviewed_at.is_(None),
            )
            .values(reviewed_at=reviewed_at)
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    alert = db.scalar(select(ProfessionalAlert).where(
        ProfessionalAlert.id == alert_id, ProfessionalAlert.professional_id == user.id,
    ))
    if alert is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert not found.")
    return ReviewOut(id=alert.id, reviewed_at=alert.reviewed_at)
