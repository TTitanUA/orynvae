from fastapi.testclient import TestClient

from app.main import app


def test_project_list_create_update_and_archive(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)

    created = client.post("/api/projects", json={"name": "  Archive City  "})

    assert created.status_code == 201
    project = created.json()
    assert project["name"] == "Archive City"
    assert project["is_hidden"] is False
    assert set(project) == {"id", "name", "is_hidden", "created_at", "updated_at", "archived_at"}

    loaded = client.get(f"/api/projects/{project['id']}")
    assert loaded.status_code == 200
    assert loaded.json()["id"] == project["id"]

    updated = client.patch(
        f"/api/projects/{project['id']}",
        json={"name": "Hidden Archive", "is_hidden": True},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Hidden Archive"
    assert updated.json()["is_hidden"] is True

    listed = client.get("/api/projects")
    assert listed.status_code == 200
    assert listed.json() == []

    privacy = client.put("/api/settings/privacy", json={"show_hidden_items": True})
    assert privacy.status_code == 200

    listed_with_hidden = client.get("/api/projects")
    assert listed_with_hidden.status_code == 200
    assert [item["id"] for item in listed_with_hidden.json()] == [project["id"]]

    archived = client.delete(f"/api/projects/{project['id']}")
    assert archived.status_code == 204

    listed_after_archive = client.get("/api/projects")
    assert listed_after_archive.status_code == 200
    assert listed_after_archive.json() == []


def test_removed_project_workspace_routes_return_not_found(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    project = client.post("/api/projects", json={"name": "Plain project"}).json()

    assert client.get(f"/api/projects/{project['id']}/workspace").status_code == 404
    assert client.post("/api/projects/setup/analyze", json={"idea_text": "Idea"}).status_code == 404
