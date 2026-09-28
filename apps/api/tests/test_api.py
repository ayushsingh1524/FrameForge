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


def test_ai_edit_requires_server_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    response = client.post(
        "/api/ai/edit-command",
        json={
            "instruction": "split the first clip around three seconds",
            "clips": [{"id": "c1", "trackId": "v1", "timelineStart": 0, "sourceIn": 0, "sourceOut": 10}],
            "tracks": [{"id": "v1", "kind": "video"}],
        },
    )
    assert response.status_code == 503
    assert "OPENAI_API_KEY" in response.json()["detail"]
