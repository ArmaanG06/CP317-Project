"""ALT-2: evaluate accepted readings against monitoring thresholds.

Input validation lives in readings.py. These limits decide whether an already
accepted measurement needs review; they never reject a submission.
"""

import math
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, StrictFloat, StrictInt, field_validator, model_validator
from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, Integer, String, Uuid, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.access import ROLE_PROFESSIONAL, is_assigned, require_role
from app.db import Base, get_db
from app.models import User


@dataclass(frozen=True)
class Threshold:
    lower: float
    upper: float
    source: str = "default"


# Adult prototype defaults for monitoring, separate from permitted input ranges.
# Blood-pressure limits intentionally flag Stage 2 values, not Stage 1 values.
# Benchmarks: AHA resting heart rate and BP categories; NHS low BP, fever and
# hypothermia; Oxford University Hospitals NHS adult resting SpO2 range.
# These are review aids for the demo, not diagnostic rules.
# https://www.heart.org/en/healthy-living/exercise-and-physical-activity/fitness-basics/target-heart-rates/
# https://www.heart.org/en/health-topics/high-blood-pressure/understanding-high-blood-pressure/understanding-blood-pressure-readings
# https://www.nhs.uk/conditions/low-blood-pressure-hypotension/
# https://www.nhs.uk/conditions/hypothermia/
# https://www.nhs.uk/symptoms/fever-in-adults/
# https://ustaging.ouh.nhs.uk/media/qaqlyhy2/82415poximeter.pdf
DEFAULT_THRESHOLDS = {
    "heart_rate": Threshold(60, 100),
    "systolic": Threshold(90, 139),
    "diastolic": Threshold(60, 89),
    "temperature": Threshold(35.0, 37.9),
    "spo2": Threshold(95, 100),
}


class PatientAlertThreshold(Base):
    """Optional patient-specific limit; THR-1 lets an assigned professional edit it (see the router below)."""

    __tablename__ = "patient_alert_thresholds"
    __table_args__ = (CheckConstraint("lower_limit < upper_limit", name="ck_patient_threshold_order"),)

    patient_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), primary_key=True)
    vital_type: Mapped[str] = mapped_column(String(20), primary_key=True)
    lower_limit: Mapped[float] = mapped_column(Float)
    upper_limit: Mapped[float] = mapped_column(Float)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), nullable=True)


class ReadingEvaluation(Base):
    """One immutable threshold snapshot per reading, including normal readings.

    Recording normal evaluations makes demo re-seeding idempotent: a later
    threshold change cannot silently reclassify an existing reading.
    """

    __tablename__ = "reading_evaluations"

    reading_id: Mapped[int] = mapped_column(Integer, ForeignKey("readings.id", ondelete="CASCADE"), primary_key=True)
    lower_limit: Mapped[float] = mapped_column(Float)
    upper_limit: Mapped[float] = mapped_column(Float)
    threshold_source: Mapped[str] = mapped_column(String(20))
    direction: Mapped[str | None] = mapped_column(String(5), nullable=True)
    breached_limit: Mapped[float | None] = mapped_column(Float, nullable=True)
    evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


def breached_limit(value: float, threshold: Threshold) -> tuple[str, float] | None:
    """A value exactly on either boundary is not flagged."""
    if value < threshold.lower:
        return "below", threshold.lower
    if value > threshold.upper:
        return "above", threshold.upper
    return None


def thresholds_for_patient(db: Session, patient_id: uuid.UUID) -> dict[str, Threshold]:
    """Use a patient override when present, otherwise the adult prototype default."""
    limits = DEFAULT_THRESHOLDS.copy()
    overrides = db.scalars(
        select(PatientAlertThreshold).where(PatientAlertThreshold.patient_id == patient_id)
    )
    for row in overrides:
        if row.vital_type not in limits:
            raise ValueError(f"Unsupported alert threshold: {row.vital_type}")
        if row.lower_limit >= row.upper_limit:
            raise ValueError(f"Invalid alert threshold: {row.vital_type}")
        limits[row.vital_type] = Threshold(row.lower_limit, row.upper_limit, "patient_override")
    return limits


def assess_readings(db: Session, readings: list) -> list[ReadingEvaluation]:
    """Add missing evaluations without committing; the caller owns the transaction."""
    if not readings:
        return []
    ids = [row.id for row in readings]
    if any(reading_id is None for reading_id in ids):
        raise ValueError("Flush readings before evaluating them.")
    existing = set(db.scalars(select(ReadingEvaluation.reading_id).where(ReadingEvaluation.reading_id.in_(ids))))
    limits_by_patient = {}
    evaluations = []
    for row in readings:
        if row.id in existing:
            continue
        if row.patient_id not in limits_by_patient:
            limits_by_patient[row.patient_id] = thresholds_for_patient(db, row.patient_id)
        threshold = limits_by_patient[row.patient_id][row.vital_type]
        breach = breached_limit(row.value, threshold)
        evaluations.append(
            ReadingEvaluation(
                reading_id=row.id,
                lower_limit=threshold.lower,
                upper_limit=threshold.upper,
                threshold_source=threshold.source,
                direction=breach[0] if breach else None,
                breached_limit=breach[1] if breach else None,
            )
        )
    db.add_all(evaluations)
    return evaluations


# --- THR-1: assigned professionals configure limits for their patients ---
router = APIRouter(tags=["thresholds"])

Number = StrictInt | StrictFloat  # strict: "abc" and "80" are rejected, not quietly converted


class LimitIn(BaseModel):
    lower: Number
    upper: Number

    @field_validator("lower", "upper")
    @classmethod
    def must_be_finite(cls, value):
        if isinstance(value, bool) or not math.isfinite(value):
            raise ValueError("Limits must be numbers.")
        return value

    @model_validator(mode="after")
    def low_below_high(self):
        if self.lower >= self.upper:
            raise ValueError("The low limit must be lower than the high limit.")
        return self


class LimitOut(BaseModel):
    vital_type: str
    lower: float
    upper: float
    source: str  # "default" or "patient_override"
    updated_at: datetime | None = None
    updated_by_name: str | None = None


def _utc(value: datetime | None) -> datetime | None:
    # SQLite returns naive datetimes in tests; Postgres returns aware ones.
    return value.replace(tzinfo=timezone.utc) if value is not None and value.tzinfo is None else value


def _require_assigned(db: Session, professional: User, patient_id: uuid.UUID) -> None:
    if not is_assigned(db, professional.id, patient_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only manage thresholds for your assigned patients.")


def _limit_out(db: Session, patient_id: uuid.UUID, vital_type: str) -> LimitOut:
    limit = thresholds_for_patient(db, patient_id)[vital_type]
    row = db.get(PatientAlertThreshold, (patient_id, vital_type))
    editor = db.get(User, row.updated_by) if row and row.updated_by else None
    return LimitOut(
        vital_type=vital_type,
        lower=limit.lower,
        upper=limit.upper,
        source=limit.source,
        updated_at=_utc(row.updated_at) if row else None,
        updated_by_name=editor.full_name if editor else None,
    )


@router.get("/patients/{patient_id}/thresholds", response_model=list[LimitOut])
def list_thresholds(
    patient_id: uuid.UUID,
    professional: User = Depends(require_role(ROLE_PROFESSIONAL)),
    db: Session = Depends(get_db),
):
    _require_assigned(db, professional, patient_id)
    return [_limit_out(db, patient_id, vital_type) for vital_type in DEFAULT_THRESHOLDS]


@router.put("/patients/{patient_id}/thresholds/{vital_type}", response_model=LimitOut)
def save_threshold(
    patient_id: uuid.UUID,
    vital_type: str,
    body: LimitIn,
    professional: User = Depends(require_role(ROLE_PROFESSIONAL)),
    db: Session = Depends(get_db),
):
    _require_assigned(db, professional, patient_id)
    if vital_type not in DEFAULT_THRESHOLDS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown measurement.")
    row = db.get(PatientAlertThreshold, (patient_id, vital_type))
    if row is None:
        row = PatientAlertThreshold(patient_id=patient_id, vital_type=vital_type)
        db.add(row)
    row.lower_limit = float(body.lower)
    row.upper_limit = float(body.upper)
    row.updated_by = professional.id  # who
    row.updated_at = datetime.now(timezone.utc)  # and when
    db.commit()
    return _limit_out(db, patient_id, vital_type)


@router.delete("/patients/{patient_id}/thresholds/{vital_type}", status_code=status.HTTP_204_NO_CONTENT)
def reset_threshold(
    patient_id: uuid.UUID,
    vital_type: str,
    professional: User = Depends(require_role(ROLE_PROFESSIONAL)),
    db: Session = Depends(get_db),
):
    """Go back to the default limit. Existing readings keep the limit they were evaluated with."""
    _require_assigned(db, professional, patient_id)
    if vital_type not in DEFAULT_THRESHOLDS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown measurement.")
    row = db.get(PatientAlertThreshold, (patient_id, vital_type))
    if row is not None:
        db.delete(row)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)