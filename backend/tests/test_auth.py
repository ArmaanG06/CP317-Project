import pytest
from fastapi.testclient import TestClient

from app.main import app

GOOD = {"email": "maya.chen@example.com", "password": "Demo-Pass-123"}


@pytest.fixture
def client():
    return TestClient(app)  # fresh cookie jar per test


def test_login_success(client):
    r = client.post("/auth/login", json=GOOD)
    assert r.status_code == 200
    assert r.json()["role"] == "patient"
    assert "password_hash" not in r.json()


def test_login_wrong_password(client):
    r = client.post("/auth/login", json={**GOOD, "password": "wrong"})
    assert r.status_code == 401
    assert r.json()["detail"] == "Incorrect email or password."


def test_login_unknown_email_gives_same_error(client):
    r = client.post("/auth/login", json={"email": "nobody@example.com", "password": "x"})
    assert r.status_code == 401
    assert r.json()["detail"] == "Incorrect email or password."


def test_protected_route_requires_login(client):
    assert client.get("/auth/me").status_code == 401


def test_logout_ends_session(client):
    client.post("/auth/login", json=GOOD)
    assert client.get("/auth/me").status_code == 200
    client.post("/auth/logout")
    assert client.get("/auth/me").status_code == 401