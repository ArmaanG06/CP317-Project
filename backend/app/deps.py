import uuid

import jwt
from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session
from typing import Annotated

from app.db import get_db
from app.models import User
from app.security import COOKIE_NAME, decode_token, set_session_cookie


def get_current_user(request: Request, response: Response, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not signed in.")
    try:
        user_id = uuid.UUID(decode_token(token)["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Your session has expired. Please sign in again.")

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Not signed in.")

    set_session_cookie(response, str(user.id))  # each request renews the 15-minute window
    return user

CurrentUser = Annotated[User, Depends(get_current_user)]