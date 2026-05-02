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
