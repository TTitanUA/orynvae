from fastapi.testclient import TestClient

from app.main import app


def test_character_routes_are_out_of_scope(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    project = client.post("/api/projects", json={"name": "Project"}).json()

    response = client.get(f"/api/projects/{project['id']}/characters")

    assert response.status_code == 404
