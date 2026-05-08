import json

from fastapi.testclient import TestClient

from app.ai import service as ai_service
from app.main import app
from app.providers.adapters import ProviderModel
from app.services import story_runtime_store
from app.services import provider_store


class QueueAdapter:
    def __init__(self, responses: list[str]) -> None:
        self.responses = responses
        self.complete_calls: list[dict[str, object]] = []

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
        self.complete_calls.append(
            {
                "model_id": model_id,
                "messages": messages,
                "temperature": temperature,
                "top_p": top_p,
                "reasoning_effort": reasoning_effort,
                "routing_config": routing_config,
            }
        )
        if not self.responses:
            raise AssertionError("No queued complete_chat response")
        return self.responses.pop(0)


def _enable_provider(client: TestClient) -> tuple[str, str]:
    model_id = "local-story-model"
    provider = client.post(
        "/api/providers",
        json={
            "type": "lmstudio",
            "name": "Local Story AI",
            "default_model_id": model_id,
        },
    ).json()
    provider_store.upsert_models(
        provider["id"],
        [ProviderModel(model_id=model_id, display_name="Local Story Model")],
    )
    return provider["id"], model_id


def test_start_story_analyze_combines_ai_action_outputs(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    provider_id, _ = _enable_provider(client)
    adapter = QueueAdapter(
        responses=[
            """
            {
              "understood_synopsis": "Курьер находит память о собственной смерти.",
              "emotional_core": "тревога перед украденным будущим",
              "suggested_title": "Память смерти",
              "questions": [{"question": "Кто подбросил память?", "why": "Это задает тайну."}],
              "warnings": []
            }
            """,
            """
            {
              "memory_items": [
                {
                  "type": "character",
                  "title": "Курьер",
                  "summary": "Носит чужие воспоминания и получает свое будущее.",
                  "importance": 2,
                  "reason": "Главный носитель конфликта."
                }
              ],
              "warnings": []
            }
            """,
            """
            {
              "story_lines": [
                {
                  "type": "mystery",
                  "title": "Источник памяти",
                  "description": "Кто уже прожил будущее курьера.",
                  "current_state": "Память только найдена.",
                  "priority": 3,
                  "reason": "Держит интригу открытой."
                }
              ],
              "warnings": []
            }
            """,
            """
            {
              "start_points": [
                {
                  "title": "Доставка не туда",
                  "situation": "Курьер открывает посылку в архиве воспоминаний.",
                  "present_character_titles": ["Курьер"],
                  "tension": "В посылке память о его смерти.",
                  "user_role_hint": "управлять курьером"
                }
              ],
              "warnings": []
            }
            """,
        ]
    )
    monkeypatch.setattr(ai_service, "create_adapter", lambda provider, api_key: adapter)

    response = client.post(
        "/api/projects/start/analyze",
        json={
            "synopsis": "Курьер в городе воспоминаний находит память о собственной смерти.",
            "tone": "мрачное",
            "temperature": 0.35,
            "top_p": 0.8,
            "reasoning_effort": "medium",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["provider_id"] == provider_id
    assert body["understood_synopsis"] == "Курьер находит память о собственной смерти."
    assert body["memory_items"][0]["title"] == "Курьер"
    assert body["story_lines"][0]["title"] == "Источник памяти"
    assert body["start_points"][0]["title"] == "Доставка не туда"
    assert [call["model_id"] for call in adapter.complete_calls] == [
        "local-story-model",
        "local-story-model",
        "local-story-model",
        "local-story-model",
    ]
    assert [call["temperature"] for call in adapter.complete_calls] == [0.35, 0.35, 0.35, 0.35]
    assert [call["top_p"] for call in adapter.complete_calls] == [0.8, 0.8, 0.8, 0.8]
    assert [call["reasoning_effort"] for call in adapter.complete_calls] == [
        "medium",
        "medium",
        "medium",
        "medium",
    ]


def test_start_story_confirm_creates_project_memory_lines_and_initial_chapter(
    tmp_path,
    monkeypatch,
):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    provider_id, model_id = _enable_provider(client)

    response = client.post(
        "/api/projects/start/confirm",
        json={
            "source_synopsis": "Курьер находит память о смерти.",
            "project_title": "Память смерти",
            "understood_synopsis": "Курьер в городе воспоминаний получает чужое будущее.",
            "provider_id": provider_id,
            "model_id": model_id,
            "expansion_policy": "ask",
            "memory_items": [
                {
                    "type": "character",
                    "title": "Курьер",
                    "summary": "Носит чужие воспоминания.",
                    "status": "canon",
                    "importance": 2,
                },
                {
                    "type": "location",
                    "title": "Лишняя локация",
                    "status": "rejected",
                },
            ],
            "story_lines": [
                {
                    "type": "mystery",
                    "title": "Кто прожил будущее?",
                    "current_state": "Память найдена.",
                    "status": "active",
                    "priority": 3,
                }
            ],
            "selected_start_point": {
                "title": "Архив",
                "situation": "Курьер вскрывает посылку в архиве.",
                "present_character_titles": ["Курьер"],
                "tension": "Внутри его смерть.",
                "user_role_hint": "управлять курьером",
            },
        },
    )

    assert response.status_code == 201
    body = response.json()
    project = body["project"]
    assert project["title"] == "Память смерти"
    assert project["active_provider_id"] == provider_id
    assert project["active_model_id"] == model_id
    assert project["expansion_policy"] == "ask"
    assert body["created_memory_items"][0]["status"] == "canon"
    assert len(body["created_memory_items"]) == 1
    assert body["created_story_lines"][0]["status"] == "active"
    assert body["initial_chapter"]["title"] == "Архив"
    assert "Внутри его смерть" in body["initial_chapter"]["synopsis"]

    stored_memory = story_runtime_store.list_memory_items(project["id"])
    stored_lines = story_runtime_store.list_story_lines(project["id"])
    stored_chapters = story_runtime_store.list_chapters(project["id"])
    line_api = client.get(f"/api/projects/{project['id']}/story-lines")
    assert [item.title for item in stored_memory] == ["Курьер"]
    assert [line.title for line in stored_lines] == ["Кто прожил будущее?"]
    assert [chapter.title for chapter in stored_chapters] == ["Архив"]
    assert line_api.status_code == 200
    assert [line["title"] for line in line_api.json()] == ["Кто прожил будущее?"]


def test_start_story_refine_applies_user_feedback_to_current_analysis(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    provider_id, model_id = _enable_provider(client)
    adapter = QueueAdapter(
        responses=[
            """
            {
              "understood_synopsis": "Курьерская история стала светлее и держится на выборе довериться сестре.",
              "emotional_core": "примирение через доверие",
              "suggested_title": "Светлая доставка",
              "questions": [],
              "warnings": []
            }
            """,
            """
            {
              "memory_items": [
                {
                  "type": "character",
                  "title": "Сестра",
                  "summary": "Помогает курьеру проверить воспоминание без вражды.",
                  "importance": 2
                }
              ],
              "warnings": []
            }
            """,
            """
            {
              "story_lines": [
                {
                  "type": "relationship",
                  "title": "Доверие сестре",
                  "description": "Курьер учится не прятать страх.",
                  "current_state": "Сестра становится союзником.",
                  "priority": 2
                }
              ],
              "warnings": []
            }
            """,
            """
            {
              "start_points": [
                {
                  "title": "Разговор на крыше",
                  "situation": "Курьер показывает сестре найденную память.",
                  "present_character_titles": ["Курьер", "Сестра"],
                  "tension": "Нужно решить, верить ли посылке.",
                  "user_role_hint": "управлять курьером"
                }
              ],
              "warnings": []
            }
            """,
        ]
    )
    monkeypatch.setattr(ai_service, "create_adapter", lambda provider, api_key: adapter)

    response = client.post(
        "/api/projects/start/refine",
        json={
            "source_synopsis": "Курьер находит память о смерти.",
            "provider_id": provider_id,
            "model_id": model_id,
            "feedback": "Сделай тон светлее и ответ: сестра должна быть союзником.",
            "current_project_title": "Память смерти",
            "current_understood_synopsis": "Курьер один против всех.",
            "current_emotional_core": "страх одиночества",
            "current_questions": [
                {"question": "Сестра помогает или мешает?", "why": "Это меняет отношения."}
            ],
            "current_memory_items": [
                {
                    "type": "character",
                    "title": "Курьер",
                    "summary": "Боится найденной памяти.",
                    "status": "proposed",
                    "importance": 1,
                }
            ],
            "current_story_lines": [],
            "current_start_points": [],
            "temperature": 0.4,
            "top_p": 0.7,
            "reasoning_effort": "low",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["suggested_title"] == "Светлая доставка"
    assert body["memory_items"][0]["title"] == "Сестра"
    assert body["story_lines"][0]["title"] == "Доверие сестре"
    assert body["start_points"][0]["title"] == "Разговор на крыше"
    first_payload = json.loads(adapter.complete_calls[0]["messages"][-1].content)
    assert first_payload["input"]["mode"] == "refine_start_story_analysis"
    assert "сестра должна быть союзником" in first_payload["input"]["user_feedback"]
    assert first_payload["input"]["current_analysis"]["project_title"] == "Память смерти"
    assert [call["temperature"] for call in adapter.complete_calls] == [0.4, 0.4, 0.4, 0.4]
    assert [call["top_p"] for call in adapter.complete_calls] == [0.7, 0.7, 0.7, 0.7]
    assert [call["reasoning_effort"] for call in adapter.complete_calls] == [
        "low",
        "low",
        "low",
        "low",
    ]


def test_start_story_requires_ai_for_analyze_and_confirm(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)

    analyze = client.post(
        "/api/projects/start/analyze",
        json={"synopsis": "Курьер находит память о смерти."},
    )
    confirm = client.post(
        "/api/projects/start/confirm",
        json={
            "source_synopsis": "Курьер находит память о смерти.",
            "project_title": "Память смерти",
            "skip_start_point": True,
        },
    )
    refine = client.post(
        "/api/projects/start/refine",
        json={
            "source_synopsis": "Курьер находит память о смерти.",
            "feedback": "Сделай светлее.",
        },
    )

    assert analyze.status_code == 409
    assert analyze.json()["detail"]["code"] == "READ_ONLY_WITHOUT_AI"
    assert confirm.status_code == 409
    assert confirm.json()["detail"]["code"] == "READ_ONLY_WITHOUT_AI"
    assert refine.status_code == 409
    assert refine.json()["detail"]["code"] == "READ_ONLY_WITHOUT_AI"
