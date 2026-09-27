from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_valid_clip_range():
    response = client.post(
        "/api/timeline/validate",
        json={"clips": [{"clip_id": "a", "source_id": "s", "start_seconds": 1, "end_seconds": 4}]},
    )
    assert response.status_code == 200
    assert response.json() == {"valid": True, "clip_count": 1}


def test_rejects_inverted_clip_range():
    response = client.post(
        "/api/timeline/validate",
        json={"clips": [{"clip_id": "a", "source_id": "s", "start_seconds": 4, "end_seconds": 1}]},
    )
    assert response.status_code == 422
