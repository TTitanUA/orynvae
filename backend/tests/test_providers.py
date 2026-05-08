from fastapi.testclient import TestClient
import pytest

from app.api import providers as providers_api
from app.main import app
from app.models.providers import ChatMessage, ProviderRecord
from app.providers import adapters
from app.providers.adapters import (
    OllamaAdapter,
    OpenAICompatibleAdapter,
    ProviderModel,
    ProviderTestResult,
)
from app.services import provider_store


@pytest.fixture
def anyio_backend():
    return "asyncio"


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


class FakeChatAdapter(FakeAdapter):
    async def complete_chat(
        self,
        *,
        model_id,
        messages,
        temperature,
        top_p=None,
        reasoning_effort=None,
        routing_config=None,
    ):
        return f"complete:{model_id}:{messages[-1].content}:{temperature}"

    async def stream_chat(
        self,
        *,
        model_id,
        messages,
        temperature,
        top_p=None,
        reasoning_effort=None,
        routing_config=None,
    ):
        yield "stream "
        yield f"{model_id} "
        yield messages[-1].content


def _assert_local_chat_timeout(timeout):
    assert timeout.connect == adapters.CHAT_CONNECT_TIMEOUT_SECONDS
    assert timeout.read is None
    assert timeout.write == adapters.CHAT_WRITE_TIMEOUT_SECONDS
    assert timeout.pool == adapters.CHAT_POOL_TIMEOUT_SECONDS


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
    assert body["models"][0]["is_allowed"] is False
    assert body["models"][0]["routing_config"] is None

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


def test_provider_chat_streaming_and_disabled_guard(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setattr(providers_api, "create_adapter", lambda provider, api_key: FakeChatAdapter())

    client = TestClient(app)
    provider = client.post(
        "/api/providers",
        json={
            "type": "lmstudio",
            "name": "Chat model",
            "default_model_id": "local-test-model",
        },
    ).json()
    refreshed = client.post(f"/api/providers/{provider['id']}/test", json={})
    assert refreshed.status_code == 200

    streamed = client.post(
        f"/api/providers/{provider['id']}/chat",
        json={
            "model_id": "local-test-model",
            "messages": [{"role": "user", "content": "continue"}],
            "stream": True,
        },
    )

    assert streamed.status_code == 200
    assert streamed.text == "stream local-test-model continue"

    completed = client.post(
        f"/api/providers/{provider['id']}/chat",
        json={
            "model_id": "local-test-model",
            "messages": [{"role": "user", "content": "rewrite"}],
            "temperature": 0.4,
            "stream": False,
        },
    )

    assert completed.status_code == 200
    assert completed.text == "complete:local-test-model:rewrite:0.4"

    disabled = client.patch(f"/api/providers/{provider['id']}", json={"is_enabled": False})
    assert disabled.status_code == 200

    blocked = client.post(
        f"/api/providers/{provider['id']}/chat",
        json={
            "model_id": "local-test-model",
            "messages": [{"role": "user", "content": "continue"}],
        },
    )

    assert blocked.status_code == 409


def test_model_preferences_update_allow_list_and_routing(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))

    client = TestClient(app)
    provider = client.post(
        "/api/providers",
        json={"type": "openrouter", "name": "OpenRouter"},
    ).json()
    provider_store.upsert_models(
        provider["id"],
        [
            ProviderModel(model_id="anthropic/claude", display_name="Claude"),
            ProviderModel(model_id="openai/gpt", display_name="GPT"),
        ],
    )

    updated = client.patch(
        f"/api/providers/{provider['id']}/models/preferences",
        json={
            "default_model_id": "anthropic/claude",
            "models": [
                {
                    "model_id": "anthropic/claude",
                    "is_allowed": True,
                    "routing_config": {
                        "order": ["anthropic"],
                        "allow_fallbacks": False,
                        "data_collection": "deny",
                        "preferred_max_latency": {"p90": 3},
                    },
                },
                {"model_id": "openai/gpt", "is_allowed": False},
            ],
        },
    )

    assert updated.status_code == 200
    body = updated.json()
    assert body["default_model_id"] == "anthropic/claude"
    models = {model["model_id"]: model for model in body["models"]}
    assert models["anthropic/claude"]["is_allowed"] is True
    assert models["anthropic/claude"]["routing_config"] == {
        "allow_fallbacks": False,
        "data_collection": "deny",
        "order": ["anthropic"],
        "preferred_max_latency": {"p90": 3.0},
    }
    assert models["openai/gpt"]["is_allowed"] is False

    rejected = client.patch(
        f"/api/providers/{provider['id']}/models/preferences",
        json={
            "default_model_id": "openai/gpt",
            "models": [{"model_id": "openai/gpt", "is_allowed": False}],
        },
    )
    assert rejected.status_code == 422


def test_provider_chat_rejects_disallowed_models(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setattr(providers_api, "create_adapter", lambda provider, api_key: FakeChatAdapter())

    client = TestClient(app)
    provider = client.post("/api/providers", json={"type": "lmstudio", "name": "Chat"}).json()
    client.post(f"/api/providers/{provider['id']}/test", json={})

    blocked = client.post(
        f"/api/providers/{provider['id']}/chat",
        json={
            "model_id": "local-test-model",
            "messages": [{"role": "user", "content": "continue"}],
        },
    )

    assert blocked.status_code == 422


@pytest.mark.anyio
async def test_openrouter_model_refresh_keeps_model_metadata(monkeypatch):
    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "data": [
                    {
                        "id": "openai/gpt-oss-120b",
                        "name": "OpenAI: gpt-oss-120b",
                        "architecture": {
                            "input_modalities": ["text"],
                            "output_modalities": ["text"],
                            "modality": "text->text",
                            "instruct_type": "chatml",
                            "tokenizer": "GPT",
                        },
                        "context_length": 131072,
                        "supported_parameters": ["temperature", "top_p", "max_tokens"],
                    }
                ]
            }

    class FakeClient:
        def __init__(self, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return None

        async def get(self, url, *, headers):
            return FakeResponse()

    monkeypatch.setattr(adapters.httpx, "AsyncClient", FakeClient)
    provider = ProviderRecord(
        id="provider",
        type="openrouter",
        name="OpenRouter",
        base_url="https://openrouter.ai/api/v1",
        has_api_key=True,
        is_local=False,
        is_external=True,
        is_enabled=True,
        is_default=True,
        streaming_enabled=True,
        models_path="/models",
        chat_path="/chat/completions",
        default_model_id="openai/gpt-oss-120b",
        last_checked_at=None,
        last_error=None,
        created_at="2026-05-04 00:00:00",
        updated_at="2026-05-04 00:00:00",
    )
    adapter = OpenAICompatibleAdapter(provider, "secret")

    models = await adapter.list_models()

    assert models[0].context_window == 131072
    assert models[0].capabilities == {
        "context_length": 131072,
        "input_modalities": ["text"],
        "instruct_type": "chatml",
        "modality": "text->text",
        "output_modalities": ["text"],
        "owned_by": None,
        "source": "openrouter",
        "supported_parameters": ["temperature", "top_p", "max_tokens"],
        "tokenizer": "GPT",
    }


@pytest.mark.anyio
async def test_openrouter_payload_includes_routing_config(monkeypatch):
    captured: dict[str, object] = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": "ok"}}]}

    class FakeClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return None

        async def post(self, url, *, headers, json):
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            return FakeResponse()

    monkeypatch.setattr(adapters.httpx, "AsyncClient", FakeClient)
    provider = ProviderRecord(
        id="provider",
        type="openrouter",
        name="OpenRouter",
        base_url="https://openrouter.ai/api/v1",
        has_api_key=True,
        is_local=False,
        is_external=True,
        is_enabled=True,
        is_default=True,
        streaming_enabled=True,
        models_path="/models",
        chat_path="/chat/completions",
        default_model_id="deepseek/deepseek-r1",
        last_checked_at=None,
        last_error=None,
        created_at="2026-05-04 00:00:00",
        updated_at="2026-05-04 00:00:00",
    )
    adapter = OpenAICompatibleAdapter(provider, "secret")

    text = await adapter.complete_chat(
        model_id="deepseek/deepseek-r1",
        messages=[ChatMessage(role="user", content="Hello")],
        temperature=0.7,
        routing_config={"order": ["deepinfra/turbo"], "allow_fallbacks": False},
    )

    assert text == "ok"
    assert captured["json"] == {
        "model": "deepseek/deepseek-r1",
        "messages": [{"role": "user", "content": "Hello"}],
        "temperature": 0.7,
        "stream": False,
        "provider": {"order": ["deepinfra/turbo"], "allow_fallbacks": False},
    }
    assert captured["timeout"].read == adapters.EXTERNAL_CHAT_READ_TIMEOUT_SECONDS


@pytest.mark.anyio
async def test_openrouter_payload_includes_sampling_and_reasoning(monkeypatch):
    captured: dict[str, object] = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": "ok"}}]}

    class FakeClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return None

        async def post(self, url, *, headers, json):
            captured["json"] = json
            return FakeResponse()

    monkeypatch.setattr(adapters.httpx, "AsyncClient", FakeClient)
    provider = ProviderRecord(
        id="provider",
        type="openrouter",
        name="OpenRouter",
        base_url="https://openrouter.ai/api/v1",
        has_api_key=True,
        is_local=False,
        is_external=True,
        is_enabled=True,
        is_default=True,
        streaming_enabled=True,
        models_path="/models",
        chat_path="/chat/completions",
        default_model_id="deepseek/deepseek-r1",
        last_checked_at=None,
        last_error=None,
        created_at="2026-05-04 00:00:00",
        updated_at="2026-05-04 00:00:00",
    )
    adapter = OpenAICompatibleAdapter(provider, "secret")

    text = await adapter.complete_chat(
        model_id="deepseek/deepseek-r1",
        messages=[ChatMessage(role="user", content="Hello")],
        temperature=0.3,
        top_p=0.9,
        reasoning_effort="high",
    )

    assert text == "ok"
    assert captured["json"]["temperature"] == 0.3
    assert captured["json"]["top_p"] == 0.9
    assert captured["json"]["reasoning"] == {"effort": "high"}


@pytest.mark.anyio
async def test_local_openai_compatible_chat_has_no_read_timeout(monkeypatch):
    captured: dict[str, object] = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": "ok"}}]}

    class FakeClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return None

        async def post(self, url, *, headers, json):
            captured["url"] = url
            return FakeResponse()

    monkeypatch.setattr(adapters.httpx, "AsyncClient", FakeClient)
    provider = ProviderRecord(
        id="provider",
        type="lmstudio",
        name="LM Studio",
        base_url="http://localhost:1234/v1",
        has_api_key=False,
        is_local=True,
        is_external=False,
        is_enabled=True,
        is_default=True,
        streaming_enabled=True,
        models_path="/models",
        chat_path="/chat/completions",
        default_model_id="google/gemma-4-26b-a4b",
        last_checked_at=None,
        last_error=None,
        created_at="2026-05-04 00:00:00",
        updated_at="2026-05-04 00:00:00",
    )
    adapter = OpenAICompatibleAdapter(provider, None)

    text = await adapter.complete_chat(
        model_id="google/gemma-4-26b-a4b",
        messages=[ChatMessage(role="user", content="Hello")],
        temperature=0.7,
    )

    assert text == "ok"
    assert captured["url"] == "http://localhost:1234/v1/chat/completions"
    _assert_local_chat_timeout(captured["timeout"])


@pytest.mark.anyio
async def test_local_ollama_chat_has_no_read_timeout(monkeypatch):
    captured: dict[str, object] = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"message": {"content": "ok"}}

    class FakeClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return None

        async def post(self, url, *, json):
            captured["url"] = url
            return FakeResponse()

    monkeypatch.setattr(adapters.httpx, "AsyncClient", FakeClient)
    provider = ProviderRecord(
        id="provider",
        type="ollama",
        name="Ollama",
        base_url="http://localhost:11434",
        has_api_key=False,
        is_local=True,
        is_external=False,
        is_enabled=True,
        is_default=True,
        streaming_enabled=True,
        models_path="/api/tags",
        chat_path="/api/chat",
        default_model_id="gemma",
        last_checked_at=None,
        last_error=None,
        created_at="2026-05-04 00:00:00",
        updated_at="2026-05-04 00:00:00",
    )
    adapter = OllamaAdapter(provider, None)

    text = await adapter.complete_chat(
        model_id="gemma",
        messages=[ChatMessage(role="user", content="Hello")],
        temperature=0.7,
    )

    assert text == "ok"
    assert captured["url"] == "http://localhost:11434/api/chat"
    _assert_local_chat_timeout(captured["timeout"])
