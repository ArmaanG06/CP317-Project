"""APT-1–3: availability, bookings, and cancellation for assigned care teams."""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, Uuid, select, update
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
    # Session notes (Figma 17–20). Shared notes reach the patient only once published; internal notes never do.
    shared_notes: Mapped[str | None] = mapped_column(Text)
    internal_notes: Mapped[str | None] = mapped_column(Text)
    notes_published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


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
    patient_id: uuid.UUID
    patient_name: str
    reason: str
    status: Literal["booked", "completed", "cancelled"]
    notes_published: bool = False  # true once the professional has shared notes with the patient
    has_draft_notes: bool = False  # professionals only: notes written but not yet shared


class NotesUpdate(BaseModel):
    """Save one notes box. `publish` shares the patient notes; saving them without it keeps them as a draft."""

    model_config = ConfigDict(extra="forbid")

    shared_notes: str | None = Field(default=None, max_length=5000)
    internal_notes: str | None = Field(default=None, max_length=5000)
    publish: bool = False

    @model_validator(mode="after")
    def check(self):
        if self.shared_notes is None and self.internal_notes is None:
            raise ValueError("Enter notes to save.")
        if self.publish and not (self.shared_notes or "").strip():
            raise ValueError("Write notes for the patient before publishing them.")
        return self


class BookingDetail(BookingView):
    professional_name: str
    shared_notes: str | None = None  # patients only receive these once published
    internal_notes: str | None = None  # never sent to patients
    notes_published_at: datetime | None = None
    notes_updated_at: datetime | None = None


def as_utc(value: datetime) -> datetime:
    # SQLite returns naive timestamps. All writes use UTC.
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def booking_status(booking: "AppointmentBooking", slot: AppointmentSlot, now: datetime) -> str:
    return "cancelled" if booking.cancelled_at else "completed" if as_utc(slot.ends_at) <= now else "booked"


def slot_view(slot: AppointmentSlot, professional_name: str, booked: bool) -> SlotView:
    return SlotView(
        id=slot.id, starts_at=as_utc(slot.starts_at), ends_at=as_utc(slot.ends_at),
        location=slot.location, professional_id=slot.professional_id,
        professional_name=professional_name, booked=booked,
    )


def lock_schedule(db: Session, user_id: uuid.UUID) -> None:
    # Serialize changes to the same user's schedule across requests. An UPDATE also
    # takes a write lock on SQLite, where SELECT FOR UPDATE is unsupported.
    db.execute(update(User).where(User.id == user_id).values(id=User.id))


def lock_slot(db: Session, slot_id: uuid.UUID) -> AppointmentSlot | None:
    db.execute(
        update(AppointmentSlot).where(AppointmentSlot.id == slot_id).values(closed=AppointmentSlot.closed)
    )
    return db.get(AppointmentSlot, slot_id)


@router.get("/slots", response_model=list[SlotView])
def list_slots(user: CurrentUser, db: Session = Depends(get_db)):
    slots = (
        select(AppointmentSlot, User.full_name, AppointmentBooking.id)
        .join(User, AppointmentSlot.professional_id == User.id)
        .outerjoin(AppointmentBooking, (AppointmentBooking.slot_id == AppointmentSlot.id) & active_booking)
        .where(AppointmentSlot.starts_at > datetime.now(timezone.utc), AppointmentSlot.closed.is_(False))
        .order_by(AppointmentSlot.starts_at, AppointmentSlot.id)
    )
    if user.role == Role.patient:
        slots = slots.join(
            PatientAssignment, PatientAssignment.professional_id == AppointmentSlot.professional_id
        ).where(PatientAssignment.patient_id == user.id)
    else:
        slots = slots.where(AppointmentSlot.professional_id == user.id)
    return [slot_view(slot, name, booking_id is not None) for slot, name, booking_id in db.execute(slots)]


@router.get("", response_model=list[BookingView])
def list_bookings(user: CurrentUser, db: Session = Depends(get_db)):
    patient = aliased(User)
    bookings = (
        select(AppointmentBooking, AppointmentSlot, User.full_name, patient.full_name)
        .join(AppointmentSlot, AppointmentBooking.slot_id == AppointmentSlot.id)
        .join(User, AppointmentSlot.professional_id == User.id)
        .join(patient, AppointmentBooking.patient_id == patient.id)
        .order_by(AppointmentSlot.starts_at, AppointmentBooking.id)
    )
    if user.role == Role.patient:
        bookings = bookings.where(AppointmentBooking.patient_id == user.id)
    else:
        bookings = bookings.where(AppointmentSlot.professional_id == user.id)

    now = datetime.now(timezone.utc)
    professional = user.role == Role.professional
    result = []
    for booking, slot, professional_name, patient_name in db.execute(bookings):
        status = booking_status(booking, slot, now)
        result.append(BookingView(
            id=booking.id, slot=slot_view(slot, professional_name, status == "booked"),
            patient_id=booking.patient_id, patient_name=patient_name, reason=booking.reason, status=status,
            notes_published=booking.notes_published_at is not None,
            has_draft_notes=professional and booking.notes_published_at is None and bool(booking.shared_notes),
        ))
    # Show upcoming visits first, followed by the most recent history.
    return sorted(result, key=lambda item: (
        item.status != "booked",
        item.slot.starts_at.timestamp() * (1 if item.status == "booked" else -1),
    ))


@router.post("/slots", status_code=201)
def create_slots(
    payload: AvailabilityCreate,
    user: User = Depends(require_role(Role.professional)),
    db: Session = Depends(get_db),
):
    lock_schedule(db, user.id)
    if payload.starts_at <= datetime.now(timezone.utc):
        raise HTTPException(422, "Choose a start time in the future.")
    overlap = db.scalar(select(AppointmentSlot.id).where(
        AppointmentSlot.professional_id == user.id,
        AppointmentSlot.closed.is_(False),
        AppointmentSlot.starts_at < payload.ends_at,
        AppointmentSlot.ends_at > payload.starts_at,
    ).limit(1))
    if overlap:
        raise HTTPException(409, "This window overlaps existing availability.")

    duration = timedelta(minutes=payload.duration_minutes)
    start = payload.starts_at
    slots = []
    while start < payload.ends_at:
        end = start + duration
        slots.append(AppointmentSlot(professional_id=user.id, starts_at=start, ends_at=end, location=payload.location))
        start = end
    db.add_all(slots)
    db.commit()
    return {"created": len(slots)}


@router.post("/slots/{slot_id}/book", status_code=201)
def book_slot(
    slot_id: uuid.UUID,
    payload: BookingCreate,
    user: User = Depends(require_role(Role.patient)),
    db: Session = Depends(get_db),
):
    lock_schedule(db, user.id)
    slot = lock_slot(db, slot_id)
    if slot is None or not is_assigned(db, slot.professional_id, user.id):
        raise HTTPException(404, "This slot is unavailable.")
    if slot.closed or as_utc(slot.starts_at) <= datetime.now(timezone.utc):
        raise HTTPException(409, "This slot is no longer available to book.")
    if db.scalar(select(AppointmentBooking.id).where(AppointmentBooking.slot_id == slot.id, active_booking)):
        raise HTTPException(409, "This slot has already been booked.")
    overlap = db.scalar(
        select(AppointmentBooking.id)
        .join(AppointmentSlot)
        .where(
            AppointmentBooking.patient_id == user.id, active_booking,
            AppointmentSlot.starts_at < as_utc(slot.ends_at),
            AppointmentSlot.ends_at > as_utc(slot.starts_at),
        )
        .limit(1)
    )
    if overlap:
        raise HTTPException(409, "You already have an appointment during this time.")

    booking = AppointmentBooking(slot_id=slot.id, patient_id=user.id, reason=payload.reason)
    db.add(booking)
    db.flush()
    booking_id = booking.id
    db.commit()
    return {"id": booking_id}


@router.delete("/bookings/{booking_id}", status_code=204)
def cancel_booking(booking_id: uuid.UUID, user: CurrentUser, db: Session = Depends(get_db)):
    row = (
        select(AppointmentBooking)
        .join(AppointmentSlot)
        .where(AppointmentBooking.id == booking_id)
    )
    if user.role == Role.patient:
        row = row.where(AppointmentBooking.patient_id == user.id)
    else:
        row = row.where(AppointmentSlot.professional_id == user.id)

    booking = db.scalar(row)
    if booking is None:
        raise HTTPException(404, "Appointment not found.")
    slot = lock_slot(db, booking.slot_id)
    db.refresh(booking)
    if booking.cancelled_at:
        return  # Repeating an earlier cancellation is safe after the slot is rebooked.
    now = datetime.now(timezone.utc)
    if as_utc(slot.starts_at) <= now:
        raise HTTPException(409, "This appointment has already started.")
    booking.cancelled_at = now
    if user.role == Role.professional:
        slot.closed = True
    db.commit()


@router.delete("/slots/{slot_id}", status_code=204)
def withdraw_slot(
    slot_id: uuid.UUID,
    user: User = Depends(require_role(Role.professional)),
    db: Session = Depends(get_db),
):
    slot = lock_slot(db, slot_id)
    if slot is None or slot.professional_id != user.id:
        raise HTTPException(404, "Slot not found.")
    if slot.closed:
        return
    if as_utc(slot.starts_at) <= datetime.now(timezone.utc) or db.scalar(
        select(AppointmentBooking.id).where(AppointmentBooking.slot_id == slot.id, active_booking)
    ):
        raise HTTPException(409, "This slot is no longer open. Refresh your schedule.")
    slot.closed = True
    db.commit()


def find_booking(db: Session, booking_id: uuid.UUID, user: User):
    """The booking with its slot and names, if this user may see it (their own visit, or their own patient's)."""
    patient = aliased(User)
    professional = aliased(User)
    row = (
        select(AppointmentBooking, AppointmentSlot, professional.full_name, patient.full_name)
        .join(AppointmentSlot, AppointmentBooking.slot_id == AppointmentSlot.id)
        .join(professional, AppointmentSlot.professional_id == professional.id)
        .join(patient, AppointmentBooking.patient_id == patient.id)
        .where(AppointmentBooking.id == booking_id)
    )
    if user.role == Role.patient:
        row = row.where(AppointmentBooking.patient_id == user.id)
    else:
        row = row.where(AppointmentSlot.professional_id == user.id)
    found = db.execute(row).first()
    if found is None:
        raise HTTPException(404, "Appointment not found.")
    return found


def booking_detail(booking, slot, professional_name, patient_name, user: User) -> BookingDetail:
    now = datetime.now(timezone.utc)
    status = booking_status(booking, slot, now)
    published = booking.notes_published_at is not None
    professional = user.role == Role.professional
    return BookingDetail(
        id=booking.id, slot=slot_view(slot, professional_name, status == "booked"),
        patient_id=booking.patient_id, patient_name=patient_name, professional_name=professional_name,
        reason=booking.reason, status=status, notes_published=published,
        has_draft_notes=professional and not published and bool(booking.shared_notes),
        shared_notes=booking.shared_notes if professional or published else None,
        internal_notes=booking.internal_notes if professional else None,
        notes_published_at=as_utc(booking.notes_published_at) if booking.notes_published_at else None,
        notes_updated_at=as_utc(booking.notes_updated_at) if professional and booking.notes_updated_at else None,
    )


@router.get("/bookings/{booking_id}", response_model=BookingDetail)
def get_booking(booking_id: uuid.UUID, user: CurrentUser, db: Session = Depends(get_db)):
    """One visit with its notes. Patients see shared notes only after they are published, and never internal notes."""
    return booking_detail(*find_booking(db, booking_id, user), user)


@router.put("/bookings/{booking_id}/notes", response_model=BookingDetail)
def save_notes(
    booking_id: uuid.UUID,
    payload: NotesUpdate,
    user: User = Depends(require_role(Role.professional)),
    db: Session = Depends(get_db),
):
    booking, slot, professional_name, patient_name = find_booking(db, booking_id, user)
    if booking.cancelled_at:
        raise HTTPException(409, "This appointment was cancelled, so notes can't be added.")
    if as_utc(slot.starts_at) > datetime.now(timezone.utc):
        raise HTTPException(409, "Notes can be written once the appointment has started.")
    now = datetime.now(timezone.utc)
    if payload.internal_notes is not None:
        booking.internal_notes = payload.internal_notes.strip() or None
    if payload.shared_notes is not None:
        text = payload.shared_notes.strip() or None
        if payload.publish:
            booking.notes_published_at = now
        elif text != booking.shared_notes:
            booking.notes_published_at = None  # edited notes go back to draft until published again
        booking.shared_notes = text
    booking.notes_updated_at = now
    db.commit()
    return booking_detail(booking, slot, professional_name, patient_name, user)
