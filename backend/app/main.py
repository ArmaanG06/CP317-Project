from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import monitoring, readings
from app.config import FRONTEND_ORIGIN
from app.routers import auth

app = FastAPI(title="Health Monitor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],  # exact origin, because "*" doesn't work with cookies
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(readings.router)
app.include_router(monitoring.router)


@app.get("/health")
def health():
    return {"status": "ok"}
