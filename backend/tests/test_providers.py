from fastapi.testclient import TestClient

from app.api import providers as providers_api
from app.main import app
from app.providers.adapters import ProviderModel, ProviderTestResult


class FakeAdapter:
    async def test_connection(self, *, model_id=None, prompt=None):
        return ProviderTestResult(
            ok=True,
            message="ok",
            latency_ms=12,
            models=[
                ProviderModel(
                    model_id="local-test-model",
                    display_name="Local Test Model",
                    capabilities={"test": True},
                )
            ],
            sample="pong" if model_id and prompt else None,
        )


def test_provider_defaults_include_external_marker(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))

    client = TestClient(app)
    response = client.get("/api/providers/defaults")

    assert response.status_code == 200
    providers = {item["type"]: item for item in response.json()}
    assert providers["lmstudio"]["is_external"] is False
    assert providers["openai"]["is_external"] is True
    assert providers["openrouter"]["requires_api_key"] is True


def test_create_provider_and_refresh_models(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setattr(providers_api, "create_adapter", lambda provider, api_key: FakeAdapter())

    client = TestClient(app)
    created = client.post(
        "/api/providers",
        json={
            "type": "lmstudio",
            "name": "Local LM Studio",
        },
    )

    assert created.status_code == 201
    provider = created.json()
    assert provider["base_url"] == "http://localhost:1234/v1"
    assert provider["is_external"] is False
    assert provider["is_enabled"] is True
    assert provider["is_default"] is True

    tested = client.post(
        f"/api/providers/{provider['id']}/test",
        json={"model_id": "local-test-model", "prompt": "ping"},
    )

    assert tested.status_code == 200
    body = tested.json()
    assert body["ok"] is True
    assert body["sample"] == "pong"
    assert body["models"][0]["model_id"] == "local-test-model"

    listed = client.get("/api/providers")
    assert listed.status_code == 200
    assert listed.json()[0]["models"][0]["display_name"] == "Local Test Model"


def test_provider_state_default_and_delete(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))

    client = TestClient(app)
    first = client.post("/api/providers", json={"type": "lmstudio", "name": "Local"})
    second = client.post("/api/providers", json={"type": "openai", "name": "OpenAI"})

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["is_default"] is True
    assert second.json()["is_default"] is False

    second_id = second.json()["id"]
    made_default = client.post(f"/api/providers/{second_id}/default-provider")
    assert made_default.status_code == 200
    assert made_default.json()["is_default"] is True

    disabled = client.patch(f"/api/providers/{second_id}", json={"is_enabled": False})
    assert disabled.status_code == 200
    assert disabled.json()["is_enabled"] is False
    assert disabled.json()["is_default"] is False

    deleted = client.delete(f"/api/providers/{first.json()['id']}")
    assert deleted.status_code == 204

    listed = client.get("/api/providers")
    assert listed.status_code == 200
    assert [item["name"] for item in listed.json()] == ["OpenAI"]
