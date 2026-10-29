from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import readings
from app.config import FRONTEND_ORIGIN
from app.db import Base, engine
from app.routers import auth


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Creates missing tables (users, readings) on startup. Can be replaced with migrations later.
    Base.metadata.create_all(engine)
    yield


app = FastAPI(title="Health Monitor API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],  # exact origin, because "*" doesn't work with cookies
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    """Return plain-language errors so the frontend can keep the user's input and show them (NFR-02)."""
    errors = []
    for err in exc.errors():
        loc = err.get("loc", ())
        field = loc[-1] if loc and isinstance(loc[-1], str) and loc[-1] != "body" else None
        if err["type"] == "extra_forbidden":
            message = f"Unknown field: {field}."
        elif err["type"] == "json_invalid":
            field, message = None, "Request body is not valid JSON."
        else:
            message = err["msg"].removeprefix("Value error, ")
        errors.append({"field": field, "message": message})
    return JSONResponse(status_code=422, content={"errors": errors})


app.include_router(auth.router)
app.include_router(readings.router)


@app.get("/health")
def health():
    return {"status": "ok"}
