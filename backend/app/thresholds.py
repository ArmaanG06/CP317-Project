from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, StrictFloat, StrictInt, model_validator

from app.access import ROLE_PROFESSIONAL, is_assigned, require_role
from app.db import get_db
from app.models import User

router = APIRouter(tags=["thresholds"])

Number = StrictInt | StrictFloat  # strict: "abc" or "80" are rejected, not coerced


class LimitIn(BaseModel):
    lower: Number
    upper: Number

    @model_validator(mode="after")
    def check_order(self):
        if self.lower >= self.upper:
            raise ValueError("The low limit must be lower than the high limit.")
        return self


class LimitOut(BaseModel):
    vital_type: str
    lower: float
    upper: float
    source: str  # "default" or "patient_override"


def _assigned_patient(db: Session, pro: User, patient_id: uuid.UUID) -> None:
    if not is_assigned(db, pro.id, patient_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only manage thresholds for your assigned patients.")


@router.get("/patients/{patient_id}/thresholds", response_model=list[LimitOut])
def get_limits(
    patient_id: uuid.UUID,
    pro: User = Depends(require_role(ROLE_PROFESSIONAL)),
    db: Session = Depends(get_db),
):
    _assigned_patient(db, pro, patient_id)
    limits = thresholds_for_patient(db, patient_id)
    return [LimitOut(vital_type=k, lower=v.lower, upper=v.upper, source=v.source) for k, v in limits.items()]


@router.put("/patients/{patient_id}/thresholds/{vital_type}", response_model=LimitOut)
def set_limit(
    patient_id: uuid.UUID,
    vital_type: str,
    body: LimitIn,
    pro: User = Depends(require_role(ROLE_PROFESSIONAL)),
    db: Session = Depends(get_db),
):
    _assigned_patient(db, pro, patient_id)
    if vital_type not in DEFAULT_THRESHOLDS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown measurement.")
    row = db.get(PatientAlertThreshold, (patient_id, vital_type))
    if row is None:
        row = PatientAlertThreshold(patient_id=patient_id, vital_type=vital_type)
        db.add(row)
    row.lower_limit, row.upper_limit = body.lower, body.upper
    row.updated_by = pro.id
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    return LimitOut(vital_type=vital_type, lower=body.lower, upper=body.upper, source="patient_override")