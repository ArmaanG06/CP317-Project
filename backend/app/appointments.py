"""APT-1–3: availability, bookings, and cancellation for assigned care teams."""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Uuid, select, update
from sqlalchemy.orm import Mapped, Session, aliased, mapped_column

from app.access import PatientAssignment, is_assigned, require_role
from app.db import Base, get_db
from app.deps import CurrentUser
from app.models import Role, User

router = APIRouter(prefix="/appointments", tags=["appointments"])


class AppointmentSlot(Base):
    __tablename__ = "appointment_slots"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    professional_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    location: Mapped[str] = mapped_column(String(200))
    closed: Mapped[bool] = mapped_column(Boolean, default=False)


class AppointmentBooking(Base):
    __tablename__ = "appointment_bookings"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    slot_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("appointment_slots.id"), index=True)
    patient_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    reason: Mapped[str] = mapped_column(String(500))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


active_booking = AppointmentBooking.cancelled_at.is_(None)
Index(
    "uq_appointment_slot_active_booking",
    AppointmentBooking.slot_id,
    unique=True,
    postgresql_where=active_booking,
    sqlite_where=active_booking,
)


class AvailabilityCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    starts_at: AwareDatetime
    ends_at: AwareDatetime
    duration_minutes: Literal[15, 30, 45, 60]
    location: str = Field(min_length=1, max_length=200)

    @field_validator("starts_at", "ends_at")
    @classmethod
    def normalize_time(cls, value: datetime) -> datetime:
        if value.second or value.microsecond:
            raise ValueError("Choose a time in whole minutes.")
        return value.astimezone(timezone.utc)

    @model_validator(mode="after")
    def validate_window(self):
        window = self.ends_at - self.starts_at
        duration = timedelta(minutes=self.duration_minutes)
        if window <= timedelta(0) or window > timedelta(days=1) or window % duration:
            raise ValueError("Choose a window of up to 24 hours that divides into whole slots.")
        return self


class BookingCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    reason: str = Field(default="", max_length=500)


class SlotView(BaseModel):
    id: uuid.UUID
    starts_at: datetime
    ends_at: datetime
    location: str
    professional_id: uuid.UUID
    professional_name: str
    booked: bool


class BookingView(BaseModel):
    id: uuid.UUID
    slot: SlotView
    patient_name: str
    reason: str
    status: Literal["booked", "completed", "cancelled"]