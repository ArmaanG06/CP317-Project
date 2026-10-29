import os

# app.config requires these; set safe test values before the app is imported.
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("JWT_SECRET", "test-secret-at-least-32-bytes-long!!")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import access, readings  # noqa: F401  (registers their tables on Base)
from app.db import Base, get_db
from app.deps import get_current_user
from app.main import app
from app.models import Role, User
from app.security import hash_password

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

DEMO_PASSWORD = "Demo-Pass-123"
TEST_USERS = {
    "patient1": ("Maya Chen", "maya.chen@example.com", Role.patient),
    "patient2": ("Daniel Okafor", "daniel.okafor@example.com", Role.patient),
    "professional": ("Dr. Lee", "dr.lee@example.com", Role.professional),
    "professional2": ("Dr. Singh", "dr.singh@example.com", Role.professional),
}


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(engine)
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)


@pytest.fixture
def db_session():
    db = TestingSessionLocal()
    yield db
    db.close()


PASSWORD_HASH = hash_password(DEMO_PASSWORD)  # hashed once; bcrypt is slow on purpose


@pytest.fixture(autouse=True)
def users(setup_db):
    """Real user rows (patients and professionals) so foreign keys and name lookups work."""
    password_hash = PASSWORD_HASH
    with TestingSessionLocal() as db:
        created = {
            key: User(full_name=name, email=email, role=role, password_hash=password_hash)
            for key, (name, email, role) in TEST_USERS.items()
        }
        db.add_all(created.values())
        db.commit()
    return created


def _client_as(user: User) -> TestClient:
    # Not used as a context manager, so no app lifespan runs.
    client = TestClient(app)

    # Set the user on every request so several client fixtures can be used in one test.
    def act_as_user(request):
        app.dependency_overrides[get_current_user] = lambda: user

    client.event_hooks = {"request": [act_as_user], "response": []}
    return client


@pytest.fixture
def patient1_client(users):
    return _client_as(users["patient1"])


@pytest.fixture
def patient2_client(users):
    return _client_as(users["patient2"])


@pytest.fixture
def professional_client(users):
    return _client_as(users["professional"])


@pytest.fixture
def professional2_client(users):
    return _client_as(users["professional2"])
