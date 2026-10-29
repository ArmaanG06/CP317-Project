import os

from dotenv import load_dotenv

# app.config requires these; tests that don't use the real database fall back to safe defaults.
load_dotenv()
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("JWT_SECRET", "test-secret")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.db import Base, get_db  # noqa: E402
from app.deps import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Role, User  # noqa: E402

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def setup_db():
    """In-memory database with three users; used by the readings tests (not test_auth.py)."""
    Base.metadata.create_all(engine)
    app.dependency_overrides[get_db] = override_get_db
    with TestingSessionLocal() as db:
        users = {
            "patient1": User(email="p1@example.com", password_hash="x", full_name="Patient One", role=Role.patient),
            "patient2": User(email="p2@example.com", password_hash="x", full_name="Patient Two", role=Role.patient),
            "professional": User(email="dr@example.com", password_hash="x", full_name="Dr. Test", role=Role.professional),
        }
        db.add_all(users.values())
        db.commit()
    yield users
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)


@pytest.fixture
def db_session(setup_db):
    db = TestingSessionLocal()
    yield db
    db.close()


def _client_as(user: User) -> TestClient:
    # Not used as a context manager, so the app lifespan (create_all on the real database) does not run.
    client = TestClient(app)

    # Set the user on every request so several client fixtures can be used in one test.
    def act_as_user(request):
        app.dependency_overrides[get_current_user] = lambda: user

    client.event_hooks = {"request": [act_as_user], "response": []}
    return client


@pytest.fixture
def patient1_client(setup_db):
    return _client_as(setup_db["patient1"])


@pytest.fixture
def patient2_client(setup_db):
    return _client_as(setup_db["patient2"])


@pytest.fixture
def professional_client(setup_db):
    return _client_as(setup_db["professional"])
