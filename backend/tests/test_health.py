from fastapi.testclient import TestClient

from app.main import app


def test_health_check_creates_data_dirs(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))

    client = TestClient(app)
    response = client.get("/api/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "orynvae-backend"
    assert (tmp_path / "data" / "projects").exists()
    assert (tmp_path / "data" / "backups").exists()

