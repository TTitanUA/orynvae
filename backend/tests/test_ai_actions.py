import sqlite3
from typing import get_args

from fastapi.testclient import TestClient

from app.ai import service as ai_service
from app.ai.json_output import extract_json_object
from app.ai.registry import ACTION_DEFINITIONS, missing_action_types
from app.main import app
from app.models.ai_actions import AiActionType
from app.models.projects import ProjectCreate
from app.providers.adapters import ProviderModel
from app.services import project_store, provider_store


class QueueAdapter:
    def __init__(
        self,
        responses: list[str] | None = None,
        chunks: list[str] | None = None,
        error: Exception | None = None,
        stream_error: Exception | None = None,
    ) -> None:
        self.responses = responses or []
        self.chunks = chunks or []
        self.error = error
        self.stream_error = stream_error
        self.complete_calls: list[dict[str, object]] = []
        self.stream_calls: list[dict[str, object]] = []

    async def complete_chat(self, *, model_id, messages, temperature, routing_config=None):
        self.complete_calls.append(
            {
                "model_id": model_id,
                "messages": messages,
                "temperature": temperature,
                "routing_config": routing_config,
            }
        )
        if self.error:
            raise self.error
        if not self.responses:
            raise AssertionError("No queued complete_chat response")
        return self.responses.pop(0)

    async def stream_chat(self, *, model_id, messages, temperature, routing_config=None):
        self.stream_calls.append(
            {
                "model_id": model_id,
                "messages": messages,
                "temperature": temperature,
                "routing_config": routing_config,
            }
        )
        if self.stream_error:
            raise self.stream_error
        for chunk in self.chunks:
            yield chunk


def _enable_provider(
    client: TestClient,
    *,
    provider_type: str = "lmstudio",
    name: str = "Local",
    model_id: str = "local-model",
) -> dict[str, object]:
    provider = client.post(
        "/api/providers",
        json={
            "type": provider_type,
            "name": name,
            "default_model_id": model_id,
        },
    ).json()
    provider_store.upsert_models(
        str(provider["id"]),
        [ProviderModel(model_id=model_id, display_name=model_id)],
    )
    return provider


def _summarize_payload(**overrides):
    payload = {
        "action_type": "summarize_session",
        "input": {"goal": "summarize"},
        "context": {"turns": [{"actor_type": "user", "content": "Open the memory."}]},
    }
    payload.update(overrides)
    return payload


def test_action_definitions_cover_all_stage2_action_types(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)

    response = client.get("/api/ai-actions/definitions")

    assert response.status_code == 200
    assert missing_action_types() == set()
    assert set(ACTION_DEFINITIONS) == set(get_args(AiActionType))
    assert len(response.json()) == len(get_args(AiActionType))
    for definition in ACTION_DEFINITIONS.values():
        schema = definition.output_model.model_json_schema()
        assert schema["type"] == "object"
        assert "properties" in schema


def test_execute_action_uses_default_provider_and_validates_structured_output(
    tmp_path,
    monkeypatch,
):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    provider = _enable_provider(client)
    adapter = QueueAdapter(
        responses=[
            '{"summary":"The courier opened the memory.","key_points":["A choice was made"],"warnings":["Sparse context"]}'
        ]
    )
    monkeypatch.setattr(ai_service, "create_adapter", lambda provider, api_key: adapter)

    response = client.post("/api/ai-actions/execute", json=_summarize_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["provider"]["provider_id"] == provider["id"]
    assert body["text"] == "The courier opened the memory."
    assert body["structured_json"]["key_points"] == ["A choice was made"]
    assert body["warnings"] == [{"code": "AI_ACTION_WARNING", "message": "Sparse context"}]
    assert adapter.complete_calls[0]["model_id"] == "local-model"


def test_project_provider_override_is_used_for_actions(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    default_provider = _enable_provider(client, name="Default", model_id="default-model")
    project_provider = _enable_provider(
        client,
        provider_type="openrouter",
        name="Project provider",
        model_id="project-model",
    )
    project = project_store.create_project(
        ProjectCreate(
            title="Project scoped",
            active_provider_id=str(project_provider["id"]),
            active_model_id="project-model",
        )
    )
    adapter = QueueAdapter(
        responses=['{"summary":"Project model answered.","key_points":[],"warnings":[]}']
    )
    seen_provider_ids: list[str] = []

    def factory(provider, api_key):
        seen_provider_ids.append(provider.id)
        return adapter

    monkeypatch.setattr(ai_service, "create_adapter", factory)

    response = client.post(
        "/api/ai-actions/execute",
        json=_summarize_payload(project_id=project.id),
    )

    assert response.status_code == 200
    assert seen_provider_ids == [project_provider["id"]]
    assert response.json()["provider"]["provider_id"] != default_provider["id"]


def test_action_requires_available_ai_provider(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)

    missing_provider = client.post("/api/ai-actions/execute", json=_summarize_payload())

    assert missing_provider.status_code == 409
    assert missing_provider.json()["detail"]["code"] == "READ_ONLY_WITHOUT_AI"

    provider = _enable_provider(client)
    client.patch(f"/api/providers/{provider['id']}", json={"is_enabled": False})
    disabled_provider = client.post(
        "/api/ai-actions/execute",
        json=_summarize_payload(provider_id=provider["id"]),
    )

    assert disabled_provider.status_code == 409
    assert disabled_provider.json()["detail"]["message"] == "AI provider is disabled"


def test_disallowed_explicit_model_is_blocked(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    provider = _enable_provider(client, model_id="allowed-model")
    provider_store.upsert_models(
        str(provider["id"]),
        [ProviderModel(model_id="blocked-model", display_name="Blocked model")],
    )

    response = client.post(
        "/api/ai-actions/execute",
        json=_summarize_payload(provider_id=provider["id"], model_id="blocked-model"),
    )

    assert response.status_code == 409
    assert response.json()["detail"]["message"] == "Selected AI model is not allowed"


def test_provider_last_error_blocks_action(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    provider = _enable_provider(client)
    provider_store.update_provider_check(str(provider["id"]), "Connection failed")

    response = client.post("/api/ai-actions/execute", json=_summarize_payload())

    assert response.status_code == 409
    assert response.json()["detail"]["message"] == "Connection failed"


def test_action_passes_openrouter_routing_config(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    provider = _enable_provider(
        client,
        provider_type="openrouter",
        name="OpenRouter",
        model_id="openrouter/model",
    )
    updated = client.patch(
        f"/api/providers/{provider['id']}/models/preferences",
        json={
            "default_model_id": "openrouter/model",
            "models": [
                {
                    "model_id": "openrouter/model",
                    "is_allowed": True,
                    "routing_config": {
                        "order": ["deepinfra"],
                        "allow_fallbacks": False,
                    },
                }
            ],
        },
    )
    assert updated.status_code == 200
    adapter = QueueAdapter(responses=['{"summary":"Routed.","key_points":[],"warnings":[]}'])
    monkeypatch.setattr(ai_service, "create_adapter", lambda provider, api_key: adapter)

    response = client.post("/api/ai-actions/execute", json=_summarize_payload())

    assert response.status_code == 200
    assert adapter.complete_calls[0]["routing_config"] == {
        "allow_fallbacks": False,
        "order": ["deepinfra"],
    }


def test_structured_repair_uses_one_ai_request_without_manual_fallback(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    _enable_provider(client)
    adapter = QueueAdapter(
        responses=[
            "not json",
            '{"understood_synopsis":"A courier finds a death memory.","emotional_core":"dread","suggested_title":"Death Memory","questions":[],"warnings":[]}',
        ]
    )
    monkeypatch.setattr(ai_service, "create_adapter", lambda provider, api_key: adapter)

    response = client.post(
        "/api/ai-actions/execute",
        json={
            "action_type": "analyze_synopsis",
            "input": {"synopsis": "A courier finds a memory of his own death."},
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["repair_performed"] is True
    assert body["structured_json"]["suggested_title"] == "Death Memory"
    assert len(adapter.complete_calls) == 2
    repair_message = adapter.complete_calls[1]["messages"][1].content
    assert "Repair the invalid AI output" in repair_message


def test_failed_structured_repair_returns_error(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    _enable_provider(client)
    adapter = QueueAdapter(responses=["not json", "{}"])
    monkeypatch.setattr(ai_service, "create_adapter", lambda provider, api_key: adapter)

    response = client.post(
        "/api/ai-actions/execute",
        json={
            "action_type": "analyze_synopsis",
            "input": {"synopsis": "A courier finds a memory of his own death."},
        },
    )

    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "AI_ACTION_VALIDATION_FAILED"
    assert len(adapter.complete_calls) == 2


def test_stream_action_returns_sse_events_with_validated_payload(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    _enable_provider(client)
    adapter = QueueAdapter(
        chunks=['{"markdown":"# Delivery', '\\n\\nHe opened it.","warnings":[]}']
    )
    monkeypatch.setattr(ai_service, "create_adapter", lambda provider, api_key: adapter)

    response = client.post(
        "/api/ai-actions/stream",
        json={
            "action_type": "assemble_draft",
            "streaming": True,
            "input": {"mode": "faithful"},
            "context": {"turns": [{"actor_type": "user", "content": "Open it."}]},
        },
    )

    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]
    assert "event: start" in response.text
    assert "event: delta" in response.text
    assert "event: structured_delta" in response.text
    assert "event: done" in response.text
    assert "# Delivery" in response.text
    assert len(adapter.stream_calls) == 1


def test_stream_action_error_event_hides_raw_provider_body(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    _enable_provider(client)
    adapter = QueueAdapter(stream_error=RuntimeError("provider body secret-token"))
    monkeypatch.setattr(ai_service, "create_adapter", lambda provider, api_key: adapter)

    response = client.post(
        "/api/ai-actions/stream",
        json={
            "action_type": "assemble_draft",
            "streaming": True,
            "input": {"mode": "faithful"},
        },
    )

    assert response.status_code == 200
    assert "event: error" in response.text
    assert "AI_PROVIDER_ERROR" in response.text
    assert "secret-token" not in response.text


def test_json_extraction_accepts_fenced_json_without_repair():
    extracted = extract_json_object(
        'The answer is:\n```json\n{"summary":"ok","key_points":[],"warnings":[]}\n```'
    )

    assert extracted == {"summary": "ok", "key_points": [], "warnings": []}


def test_ai_actions_do_not_create_sqlite_log_tables(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(data_dir))
    client = TestClient(app)
    _enable_provider(client)
    adapter = QueueAdapter(responses=['{"summary":"Safe.","key_points":[],"warnings":[]}'])
    monkeypatch.setattr(ai_service, "create_adapter", lambda provider, api_key: adapter)

    response = client.post("/api/ai-actions/execute", json=_summarize_payload())

    assert response.status_code == 200
    with sqlite3.connect(data_dir / "app.db") as connection:
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            ).fetchall()
        }

    assert "debug_logs" not in tables
    assert "ai_request_logs" not in tables
    assert not any("prompt" in table or "response" in table for table in tables)
