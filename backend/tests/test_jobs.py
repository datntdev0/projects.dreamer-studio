import json

from fastapi.testclient import TestClient

from app.main import create_app

TOKEN = "secret-token"
VERSION = "1.2.3"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


def make_client() -> TestClient:
    return TestClient(create_app(TOKEN, VERSION))


def run_demo(params: dict[str, object]) -> list[dict[str, object]]:
    response = make_client().post("/jobs/demo", json=params, headers=AUTH)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/x-ndjson")
    return [json.loads(line) for line in response.text.splitlines() if line]


def test_demo_streams_progress_up_to_100_then_done() -> None:
    events = run_demo({"ticks": 4, "tickMs": 1, "fail": False})
    percents = [event["percent"] for event in events if event["type"] == "progress"]
    assert percents == sorted(percents)
    assert percents[-1] == 100
    assert events[-1] == {"type": "done"}
    assert all(event["type"] != "error" for event in events)


def test_demo_fail_ends_with_job_failed_and_no_done() -> None:
    events = run_demo({"ticks": 4, "tickMs": 1, "fail": True})
    assert events[-1]["type"] == "error"
    assert events[-1]["code"] == "JOB_FAILED"
    assert events[-1]["message"]
    assert all(event["type"] != "done" for event in events)


def test_unknown_type_returns_not_found() -> None:
    response = make_client().post("/jobs/nope", json={}, headers=AUTH)
    assert response.status_code == 404
    assert response.json()["code"] == "JOB_UNKNOWN"


def test_missing_token_returns_unauthorized() -> None:
    response = make_client().post("/jobs/demo", json={"ticks": 1, "tickMs": 1, "fail": False})
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"
