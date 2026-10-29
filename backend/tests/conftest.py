import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.deps import CurrentUser, get_current_user
from app.main import app

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


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


def _client_as(user: CurrentUser) -> TestClient:
    # Not used as a context manager, so the app lifespan (create_all on dev.db) does not run.
    client = TestClient(app)

    # Set the user on every request so several client fixtures can be used in one test.
    def act_as_user(request):
        app.dependency_overrides[get_current_user] = lambda: user

    client.event_hooks = {"request": [act_as_user], "response": []}
    return client


@pytest.fixture
def patient1_client():
    return _client_as(CurrentUser(id=1, role="patient"))


@pytest.fixture
def patient2_client():
    return _client_as(CurrentUser(id=2, role="patient"))


@pytest.fixture
def professional_client():
    return _client_as(CurrentUser(id=99, role="professional"))
