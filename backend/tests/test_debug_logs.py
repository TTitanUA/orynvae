import json

from fastapi.testclient import TestClient
import pytest

from app.main import app
from app.models.providers import ChatMessage, ProviderRecord
from app.providers import adapters
from app.providers.adapters import OpenAICompatibleAdapter


@pytest.fixture
def anyio_backend():
    return "asyncio"


def _entries(log_dir):
    entries = []
    for path in log_dir.glob("app-*.jsonl"):
        entries.extend(json.loads(line) for line in path.read_text(encoding="utf-8").splitlines())
    return entries


def test_debug_log_status_reflects_env(monkeypatch, tmp_path):
    monkeypatch.setenv("ORYNVAE_LOG_DIR", str(tmp_path / "logs"))
    monkeypatch.delenv("DEBUG", raising=False)

    client = TestClient(app)
    disabled = client.get("/api/debug/logs")

    assert disabled.status_code == 200
    assert disabled.json() == {"enabled": False}
    assert not (tmp_path / "logs").exists()

    monkeypatch.setenv("DEBUG", "true")
    enabled = client.get("/api/debug/logs")

    assert enabled.status_code == 200
    assert enabled.json() == {"enabled": True}


def test_frontend_debug_logs_write_jsonl_when_debug_enabled(monkeypatch, tmp_path):
    log_dir = tmp_path / "logs"
    monkeypatch.setenv("DEBUG", "1")
    monkeypatch.setenv("ORYNVAE_LOG_DIR", str(log_dir))

    client = TestClient(app)
    response = client.post(
        "/api/debug/logs",
        json={
            "entries": [
                {
                    "timestamp": "2026-05-04 12:00:00.000 +0300",
                    "module": "frontend",
                    "category": "http",
                    "operation": "fetch.http.error",
                    "payload": {"url": "/api/projects", "status_code": 502},
                }
            ]
        },
    )

    assert response.status_code == 204
    entries = _entries(log_dir)
    frontend_entry = next(entry for entry in entries if entry["module"] == "frontend")
    assert frontend_entry["category"] == "http"
    assert frontend_entry["operation"] == "fetch.http.error"
    assert frontend_entry["payload"] == {
        "frontend_timestamp": "2026-05-04 12:00:00.000 +0300",
        "url": "/api/projects",
        "status_code": 502,
    }


def test_frontend_debug_logs_are_ignored_when_debug_disabled(monkeypatch, tmp_path):
    log_dir = tmp_path / "logs"
    monkeypatch.delenv("DEBUG", raising=False)
    monkeypatch.setenv("ORYNVAE_LOG_DIR", str(log_dir))

    client = TestClient(app)
    response = client.post(
        "/api/debug/logs",
        json={
            "entries": [
                {
                    "timestamp": "2026-05-04 12:00:00.000 +0300",
                    "module": "frontend",
                    "category": "system",
                    "operation": "window.error",
                    "payload": {"message": "boom"},
                }
            ]
        },
    )

    assert response.status_code == 204
    assert not log_dir.exists()


@pytest.mark.anyio
async def test_llm_debug_logging_records_payload_and_redacts_headers(monkeypatch, tmp_path):
    log_dir = tmp_path / "logs"
    monkeypatch.setenv("DEBUG", "true")
    monkeypatch.setenv("ORYNVAE_LOG_DIR", str(log_dir))

    class FakeResponse:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": "ok"}}]}

    class FakeClient:
        def __init__(self, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return None

        async def post(self, url, *, headers, json):
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
    entries = _entries(log_dir)
    request_entry = next(entry for entry in entries if entry["operation"] == "chat.request")
    response_entry = next(entry for entry in entries if entry["operation"] == "chat.response")
    assert request_entry["category"] == "LLM"
    assert request_entry["payload"]["headers"]["Authorization"] == "[redacted]"
    assert request_entry["payload"]["request"]["messages"] == [{"role": "user", "content": "Hello"}]
    assert response_entry["payload"]["status_code"] == 200
    assert response_entry["payload"]["text_length"] == 2
