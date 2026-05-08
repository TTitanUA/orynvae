from fastapi.testclient import TestClient

from app.main import app
from app.providers.adapters import ProviderModel
from app.services import provider_store


def _enable_ai(client: TestClient) -> tuple[str, str]:
    model_id = "local-model"
    provider = client.post(
        "/api/providers",
        json={
            "type": "lmstudio",
            "name": "Local",
            "default_model_id": model_id,
        },
    ).json()
    provider_store.upsert_models(
        provider["id"],
        [ProviderModel(model_id=model_id, display_name="Local Model")],
    )
    return provider["id"], model_id


def test_project_list_create_update_and_archive(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    provider_id, model_id = _enable_ai(client)

    created = client.post(
        "/api/projects",
        json={
            "title": "  Archive City  ",
            "synopsis": "Memory noir",
            "active_provider_id": provider_id,
            "active_model_id": model_id,
            "expansion_policy": "ask",
        },
    )

    assert created.status_code == 201
    project = created.json()
    assert project["title"] == "Archive City"
    assert project["synopsis"] == "Memory noir"
    assert project["active_provider_id"] == provider_id
    assert project["active_model_id"] == model_id
    assert set(project) == {
        "id",
        "title",
        "synopsis",
        "status",
        "active_provider_id",
        "active_model_id",
        "expansion_policy",
        "created_at",
        "updated_at",
        "archived_at",
    }

    loaded = client.get(f"/api/projects/{project['id']}")
    assert loaded.status_code == 200
    assert loaded.json()["id"] == project["id"]

    updated = client.patch(
        f"/api/projects/{project['id']}",
        json={"title": "Archive City Revised", "status": "active"},
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Archive City Revised"

    listed = client.get("/api/projects")
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [project["id"]]

    archived = client.delete(f"/api/projects/{project['id']}")
    assert archived.status_code == 204

    listed_after_archive = client.get("/api/projects")
    assert listed_after_archive.status_code == 200
    assert listed_after_archive.json() == []


def test_project_writes_require_available_ai(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)

    blocked = client.post("/api/projects", json={"title": "No AI"})

    assert blocked.status_code == 409
    assert blocked.json()["detail"]["code"] == "READ_ONLY_WITHOUT_AI"
    assert client.get("/api/projects").status_code == 200
    assert client.get("/api/runtime/status").json()["read_only"] is True


def test_runtime_status_requires_enabled_allowed_model_without_last_error(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)

    provider = client.post(
        "/api/providers",
        json={"type": "lmstudio", "name": "Local", "default_model_id": "blocked-model"},
    ).json()
    provider_store.upsert_models(
        provider["id"],
        [ProviderModel(model_id="blocked-model", display_name="Blocked")],
    )

    assert client.get("/api/runtime/status").json()["ai_available"] is True

    preferences = client.patch(
        f"/api/providers/{provider['id']}/models/preferences",
        json={
            "default_model_id": None,
            "models": [{"model_id": "blocked-model", "is_allowed": False}],
        },
    )
    assert preferences.status_code == 200

    missing_model = client.post("/api/projects", json={"title": "Missing model"})
    assert missing_model.status_code == 409

    provider_store.update_provider_check(provider["id"], "Connection failed")
    errored = client.get("/api/runtime/status")
    assert errored.status_code == 200
    assert errored.json()["reason"] == "Connection failed"

    disabled = client.patch(f"/api/providers/{provider['id']}", json={"is_enabled": False})
    assert disabled.status_code == 200
    assert client.post("/api/providers", json={"type": "ollama", "name": "Settings stay open"}).status_code == 201


def test_removed_project_workspace_routes_return_not_found(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    _enable_ai(client)
    project = client.post("/api/projects", json={"title": "Plain project"}).json()

    assert client.get(f"/api/projects/{project['id']}/workspace").status_code == 404
    assert client.post("/api/projects/setup/analyze", json={"idea_text": "Idea"}).status_code == 404
