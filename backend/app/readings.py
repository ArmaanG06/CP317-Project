import math
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import AfterValidator, BaseModel, ConfigDict, field_validator, model_validator
from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, func, select
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.db import Base, get_db
from app.deps import CurrentUser

# --- Input limits ---
# Physically plausible values used to reject bad input (inclusive bounds).
# These are NOT alert thresholds; threshold flagging is a separate feature.
VITAL_LIMITS = {
    "heart_rate": {"unit": "bpm", "min": 20, "max": 250, "label": "Heart rate"},
    "systolic": {"unit": "mmHg", "min": 50, "max": 250, "label": "Systolic pressure"},
    "diastolic": {"unit": "mmHg", "min": 30, "max": 150, "label": "Diastolic pressure"},
    "temperature": {"unit": "°C", "min": 30.0, "max": 45.0, "label": "Temperature"},
    "spo2": {"unit": "%", "min": 50, "max": 100, "label": "SpO2"},
}
VITAL_ORDER = ["heart_rate", "systolic", "diastolic", "temperature", "spo2"]


# --- Model ---
class Reading(Base):
    """One row per vital value (long format). Blood pressure is stored as two rows."""

    __tablename__ = "readings"
    __table_args__ = (Index("ix_readings_patient_vital_time", "patient_id", "vital_type", "recorded_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    vital_type: Mapped[str] = mapped_column(String(20))
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(10))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # Groups the values from one form submission (keeps systolic/diastolic linked).
    submission_id: Mapped[str] = mapped_column(String(36))
    source: Mapped[str] = mapped_column(String(30), default="patient_entered")


# --- Schemas ---
class ReadingCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    heart_rate: float | None = None
    systolic: float | None = None
    diastolic: float | None = None
    temperature: float | None = None
    spo2: float | None = None

    @field_validator(*VITAL_ORDER, mode="before")
    @classmethod
    def check_value(cls, v, info):
        if v is None:
            return v
        limits = VITAL_LIMITS[info.field_name]
        label, unit = limits["label"], limits["unit"]
        if isinstance(v, bool) or not isinstance(v, (int, float)) or (isinstance(v, float) and not math.isfinite(v)):
            raise ValueError(f"{label} must be a number.")
        if info.field_name == "temperature":
            if abs(v * 10 - round(v * 10)) > 1e-9:
                raise ValueError(f"{label} can have at most 1 decimal place.")
        elif not float(v).is_integer():
            raise ValueError(f"{label} must be a whole number.")
        if not limits["min"] <= v <= limits["max"]:
            raise ValueError(f"{label} must be between {limits['min']} and {limits['max']} {unit}.")
        return v

    @model_validator(mode="after")
    def check_combination(self):
        if all(getattr(self, name) is None for name in VITAL_ORDER):
            raise ValueError("Enter at least one vital sign.")
        if (self.systolic is None) != (self.diastolic is None):
            raise ValueError("Enter both systolic and diastolic blood pressure.")
        if self.systolic is not None and self.systolic <= self.diastolic:
            raise ValueError("Systolic pressure must be greater than diastolic pressure.")
        return self


def _as_utc(v: datetime) -> datetime:
    # SQLite returns naive datetimes; values are always stored as UTC.
    if v.tzinfo is None:
        return v.replace(tzinfo=timezone.utc)
    return v


UTCDatetime = Annotated[datetime, AfterValidator(_as_utc)]


class ReadingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    vital_type: str
    value: float
    unit: str
    recorded_at: UTCDatetime
    submission_id: str
    source: str


class LatestReading(BaseModel):
    vital_type: str
    unit: str
    value: float | None
    recorded_at: UTCDatetime | None
    available: bool
    message: str | None


# --- Logic ---
def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def save_reading(db: Session, patient_id: uuid.UUID, payload: ReadingCreate) -> list[Reading]:
    submission_id = str(uuid.uuid4())
    recorded_at = utcnow()
    rows = [
        Reading(
            patient_id=patient_id,
            vital_type=name,
            value=float(getattr(payload, name)),
            unit=VITAL_LIMITS[name]["unit"],
            recorded_at=recorded_at,
            submission_id=submission_id,
            source="patient_entered",
        )
        for name in VITAL_ORDER
        if getattr(payload, name) is not None
    ]
    db.add_all(rows)
    db.commit()
    for row in rows:
        db.refresh(row)
    return rows


def get_latest(db: Session, patient_id: uuid.UUID) -> list[LatestReading]:
    ranked = (
        select(
            Reading.id,
            func.row_number()
            .over(partition_by=Reading.vital_type, order_by=(Reading.recorded_at.desc(), Reading.id.desc()))
            .label("rn"),
        )
        .where(Reading.patient_id == patient_id)
        .subquery()
    )
    rows = db.scalars(select(Reading).join(ranked, Reading.id == ranked.c.id).where(ranked.c.rn == 1))
    newest = {row.vital_type: row for row in rows}

    result = []
    for name in VITAL_ORDER:
        row = newest.get(name)
        result.append(
            LatestReading(
                vital_type=name,
                unit=VITAL_LIMITS[name]["unit"],
                value=row.value if row else None,
                recorded_at=row.recorded_at if row else None,
                available=row is not None,
                message=None if row else "No reading available",
            )
        )
    return result


# --- Routes ---
router = APIRouter(prefix="/readings", tags=["readings"])


def _require_patient(user: CurrentUser) -> None:
    # AUTH-2: patients only read and write their own records.
    if user.role != "patient":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only patients can submit or view their own readings.")


@router.post("", status_code=status.HTTP_201_CREATED, response_model=list[ReadingOut])
def create_reading(
    payload: ReadingCreate,
    user: CurrentUser,
    db: Session = Depends(get_db),
):
    _require_patient(user)
    return save_reading(db, user.id, payload)


@router.get("/latest", response_model=list[LatestReading])
def latest_readings(
    user: CurrentUser,
    db: Session = Depends(get_db),
):
    _require_patient(user)
    return get_latest(db, user.id)
