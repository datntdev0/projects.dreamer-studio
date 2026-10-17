from fastapi.testclient import TestClient

from app.main import create_app

TOKEN = "secret-token"
VERSION = "1.2.3"


def make_client() -> TestClient:
    return TestClient(create_app(TOKEN, VERSION))


def test_missing_header_returns_unauthorized() -> None:
    response = make_client().get("/health")
    assert response.status_code == 401
    body = response.json()
    assert body["code"] == "UNAUTHORIZED"
    assert body["details"] is None
    assert "message" in body


def test_wrong_token_returns_unauthorized() -> None:
    response = make_client().get("/health", headers={"Authorization": "Bearer wrong"})
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"


def test_right_token_returns_status_and_version() -> None:
    response = make_client().get("/health", headers={"Authorization": f"Bearer {TOKEN}"})
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": VERSION}
