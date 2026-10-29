import os
from dataclasses import dataclass
from typing import Literal


@dataclass
class CurrentUser:
    id: int
    role: Literal["patient", "professional"]


def get_current_user() -> CurrentUser:
    """PLACEHOLDER — AUTH-1/AUTH-2 owner replaces this body with real session/JWT verification; endpoint code must not change."""
    return CurrentUser(id=int(os.getenv("DEV_PATIENT_ID", "1")), role="patient")
