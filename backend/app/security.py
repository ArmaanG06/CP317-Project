from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Response

from app.config import COOKIE_SECURE, JWT_SECRET, SESSION_MINUTES

COOKIE_NAME = "access_token"


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except ValueError:
        return False

DUMMY_HASH = hash_password("not-a-real-password") # Checked when the email doesn't exist, so a wrong email takes as long as a wrong password. Otherwise response time reveals which emails are registered.


def create_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": user_id, "iat": now, "exp": now + timedelta(minutes=SESSION_MINUTES)}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])


def set_session_cookie(response: Response, user_id: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=create_token(user_id),
        httponly=True,   # JavaScript can't read it, which blocks token theft
        samesite="lax",  # blocks most cross-site request forgery
        secure=COOKIE_SECURE,
        max_age=SESSION_MINUTES * 60,
        path="/",
    )