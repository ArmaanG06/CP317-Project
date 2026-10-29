from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app import monitoring, readings
from app.db import Base, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Creates missing tables on startup. The DB owner may replace this with migrations.
    Base.metadata.create_all(engine)
    yield


app = FastAPI(title="CP317 Health Monitoring API", lifespan=lifespan)


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


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(readings.router)
app.include_router(monitoring.router)
