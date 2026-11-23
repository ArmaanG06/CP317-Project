from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException

from app.db import Base, engine
from app.main import app as api

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


class SPAStaticFiles(StaticFiles):

    async def get_response(self, path, scope):
        try:
            return await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code == 404:
                return await super().get_response("index.html", scope)
            raise


@asynccontextmanager
async def lifespan(_app):
    Base.metadata.create_all(engine)
    yield


site = FastAPI(title="Health Monitor", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
site.mount("/api", api)
if STATIC_DIR.exists():
    site.mount("/", SPAStaticFiles(directory=STATIC_DIR, html=True))
