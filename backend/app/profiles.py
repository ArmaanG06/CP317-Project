import re
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, field_validator, model_validator
from sqlalchemy import Date, DateTime, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.db import Base, get_db
from app.deps import CurrentUser

# --- Options ---
SEX_OPTIONS = ["female", "male", "intersex"]
PROVINCES = {
    "AB": "Alberta", "BC": "British Columbia", "MB": "Manitoba", "NB": "New Brunswick",
    "NL": "Newfoundland and Labrador", "NS": "Nova Scotia", "NT": "Northwest Territories",
    "NU": "Nunavut", "ON": "Ontario", "PE": "Prince Edward Island", "QC": "Quebec",
    "SK": "Saskatchewan", "YT": "Yukon",
}
POSTAL_CODE = re.compile(r"^([A-Z]\d[A-Z])\s?(\d[A-Z]\d)$")


# --- Model ---
class Profile(Base):
    """Personal details for any user (patient or professional), one row per user."""

    __tablename__ = "profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    legal_name: Mapped[str] = mapped_column(String(120))
    preferred_name: Mapped[str | None] = mapped_column(String(60))
    date_of_birth: Mapped[date] = mapped_column(Date)
    sex: Mapped[str] = mapped_column(String(10))
    gender: Mapped[str | None] = mapped_column(String(50))
    address_line1: Mapped[str] = mapped_column(String(120))
    address_line2: Mapped[str | None] = mapped_column(String(120))
    city: Mapped[str] = mapped_column(String(80))
    province: Mapped[str] = mapped_column(String(2))
    postal_code: Mapped[str] = mapped_column(String(7))
    phone: Mapped[str] = mapped_column(String(20))
    emergency_contact_name: Mapped[str | None] = mapped_column(String(120))
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(20))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


# --- Schemas ---
REQUIRED = {
    "legal_name": "Enter your full legal name.",
    "date_of_birth": "Enter your date of birth.",
    "sex": "Choose your sex.",
    "address_line1": "Enter your street address.",
    "city": "Enter your city.",
    "province": "Choose your province or territory.",
    "postal_code": "Enter your postal code.",
    "phone": "Enter your phone number.",
}
MAX_LENGTHS = {
    "legal_name": 120, "preferred_name": 60, "gender": 50, "address_line1": 120,
    "address_line2": 120, "city": 80, "emergency_contact_name": 120,
}


def format_phone(raw: str, label: str) -> str:
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) != 10:
        raise ValueError(f"{label} must be a 10-digit phone number, like 519-555-0123.")
    return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"


class ProfileUpdate(BaseModel):
    # validate_default runs the validators on missing fields, so required ones get a plain-language error.
    model_config = ConfigDict(extra="forbid", validate_default=True)

    legal_name: str | None = None
    preferred_name: str | None = None
    date_of_birth: date | None = None
    sex: str | None = None
    gender: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    province: str | None = None
    postal_code: str | None = None
    phone: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None

    @field_validator("*", mode="before")
    @classmethod
    def clean(cls, v, info):
        if isinstance(v, str):
            v = v.strip() or None
        if v is None:
            if info.field_name in REQUIRED:
                raise ValueError(REQUIRED[info.field_name])
            return None
        if not isinstance(v, str):
            raise ValueError("Enter text for this field.")
        if info.field_name == "date_of_birth":
            try:
                return date.fromisoformat(v)
            except ValueError:
                raise ValueError("Enter your date of birth as YYYY-MM-DD.")
        limit = MAX_LENGTHS.get(info.field_name)
        if limit and len(v) > limit:
            raise ValueError(f"Use {limit} characters or fewer.")
        return v

    @field_validator("date_of_birth")
    @classmethod
    def check_dob(cls, v):
        if v > date.today():
            raise ValueError("Date of birth can't be in the future.")
        if v.year < 1900:
            raise ValueError("Enter a date of birth after 1900.")
        return v

    @field_validator("sex")
    @classmethod
    def check_sex(cls, v):
        if v.lower() not in SEX_OPTIONS:
            raise ValueError("Choose female, male or intersex.")
        return v.lower()

    @field_validator("province")
    @classmethod
    def check_province(cls, v):
        if v.upper() not in PROVINCES:
            raise ValueError("Choose a Canadian province or territory.")
        return v.upper()

    @field_validator("postal_code")
    @classmethod
    def check_postal_code(cls, v):
        match = POSTAL_CODE.match(v.upper())
        if not match:
            raise ValueError("Enter a Canadian postal code, like N2L 3C5.")
        return f"{match[1]} {match[2]}"

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v):
        return format_phone(v, "Phone number")

    @field_validator("emergency_contact_phone")
    @classmethod
    def check_emergency_phone(cls, v):
        return v and format_phone(v, "Emergency contact phone")

    @model_validator(mode="after")
    def check_emergency_pair(self):
        if (self.emergency_contact_name is None) != (self.emergency_contact_phone is None):
            raise ValueError("Enter both a name and a phone number for your emergency contact, or leave both blank.")
        return self


class ProfileOut(BaseModel):
    email: str
    role: str
    legal_name: str | None = None
    preferred_name: str | None = None
    date_of_birth: date | None = None
    sex: str | None = None
    gender: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    province: str | None = None
    postal_code: str | None = None
    phone: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    updated_at: datetime | None = None


# --- Logic ---
def to_out(user, profile: Profile | None) -> ProfileOut:
    fields = {}
    if profile:
        fields = {name: getattr(profile, name) for name in ProfileOut.model_fields if name not in ("email", "role")}
    return ProfileOut(email=user.email, role=user.role.value, **fields)


def save_profile(db: Session, user_id: uuid.UUID, payload: ProfileUpdate) -> Profile:
    profile = db.get(Profile, user_id) or Profile(user_id=user_id)
    for name, value in payload.model_dump().items():
        setattr(profile, name, value)
    profile.updated_at = datetime.now(timezone.utc)
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


# --- Routes ---
# Patients and professionals can each read and update only their own profile.
router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=ProfileOut)
def get_profile(user: CurrentUser, db: Session = Depends(get_db)):
    return to_out(user, db.get(Profile, user.id))


@router.put("", response_model=ProfileOut)
def update_profile(payload: ProfileUpdate, user: CurrentUser, db: Session = Depends(get_db)):
    return to_out(user, save_profile(db, user.id, payload))
