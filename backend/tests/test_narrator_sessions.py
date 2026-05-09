import json
import sqlite3

from fastapi.testclient import TestClient

from app.ai import service as ai_service
from app.main import app
from app.models.projects import ProjectCreate
from app.models.story_runtime import (
    ChapterCreate,
    ChapterSessionCreate,
    ChapterUpdate,
    MemoryItemCreate,
    SessionSuggestedActionCreate,
    SessionTurnCreate,
    StoryLineCreate,
)
from app.providers.adapters import ProviderModel
from app.services import project_store, provider_store, story_runtime_store


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


def _enable_ai(client: TestClient) -> tuple[str, str]:
    model_id = "local-narrator-model"
    provider = client.post(
        "/api/providers",
        json={
            "type": "lmstudio",
            "name": "Local Narrator AI",
            "default_model_id": model_id,
        },
    ).json()
    provider_store.upsert_models(
        provider["id"],
        [ProviderModel(model_id=model_id, display_name="Local Narrator Model")],
    )
    return provider["id"], model_id


def _create_project(client: TestClient) -> dict[str, object]:
    provider_id, model_id = _enable_ai(client)
    response = client.post(
        "/api/projects",
        json={
            "title": "Memory Courier",
            "synopsis": "A courier finds a future memory.",
            "active_provider_id": provider_id,
            "active_model_id": model_id,
        },
    )
    assert response.status_code == 201
    return response.json()


def _prepared_session(project_id: str):
    character = story_runtime_store.create_memory_item(
        project_id,
        MemoryItemCreate(type="character", title="Courier", status="canon"),
    )
    line = story_runtime_store.create_story_line(
        project_id,
        StoryLineCreate(type="mystery", title="Death memory source", status="active"),
    )
    chapter = story_runtime_store.create_chapter(
        project_id,
        ChapterCreate(title="Archive Door", order_index=1, status="planned"),
    )
    session = story_runtime_store.create_chapter_session(
        project_id,
        ChapterSessionCreate(
            chapter_id=chapter.id,
            status="preparing",
            user_role="single_character",
            controlled_character_ids=[character.id],
            active_story_line_ids=[line.id],
            tone="tense",
            pace="medium",
        ),
    )
    chapter = story_runtime_store.update_chapter(
        project_id,
        chapter.id,
        ChapterUpdate(session_id=session.id),
    )
    opening = story_runtime_store.create_session_turn(
        session.id,
        SessionTurnCreate(
            turn_index=1,
            actor_type="ai",
            turn_type="narration",
            content="Ты стоишь у двери архива.",
            related_memory_item_ids=[character.id],
            related_story_line_ids=[line.id],
        ),
    )
    return character, line, chapter, session, opening


def test_narrator_session_lifecycle_turn_log_and_completion(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    project = _create_project(client)
    project_id = str(project["id"])
    character, line, _chapter, session, _opening = _prepared_session(project_id)

    started = client.post(f"/api/sessions/{session.id}/start")
    assert started.status_code == 200
    assert started.json()["session"]["status"] == "active"
    assert started.json()["chapter"]["status"] == "in_session"

    adapter = QueueAdapter(
        responses=[
            """
            {
              "narration_markdown": "Архивариус замечает капсулу и делает вид, что не узнал ее.",
              "suggested_actions": [
                {
                  "label": "Спрятать капсулу",
                  "action": "Спрятать воспоминание в рукав и спросить про охрану.",
                  "tone": "осторожно"
                }
              ],
              "key_event_candidates": [
                {
                  "title": "Архивариус узнает капсулу",
                  "summary": "Архивариус заметил воспоминание, но скрыл реакцию.",
                  "consequences": "Курьер понимает, что архив связан с тайной.",
                  "related_memory_titles": ["Courier"],
                  "related_story_line_titles": ["Death memory source"]
                }
              ],
              "memory_proposal_candidates": [
                {
                  "proposal_type": "new_fact",
                  "title": "Архивариус видел капсулу раньше",
                  "suggested_payload": {
                    "type": "canon_fact",
                    "summary": "Архивариус узнал капсулу запрещенного воспоминания."
                  },
                  "reason": "Это важный след, но пользователь еще не подтвердил канон."
                }
              ],
              "story_line_update_candidates": [
                {
                  "title": "Death memory source",
                  "before_state": "Курьер не знает источник.",
                  "after_state": "Архив может быть связан с капсулой.",
                  "event_summary": "Реакция архивариуса стала новым следом.",
                  "reason": "Линия тайны немного продвинулась."
                }
              ],
              "warnings": []
            }
            """,
            """
            {
              "narration_markdown": "Архивариус тихо закрывает дверь и спрашивает, кто еще видел капсулу.",
              "suggested_actions": [],
              "key_event_candidates": [],
              "memory_proposal_candidates": [],
              "story_line_update_candidates": [],
              "warnings": ["Держим сцену короткой."]
            }
            """,
        ]
    )
    monkeypatch.setattr(ai_service, "create_adapter", lambda provider, api_key: adapter)

    first_turn = client.post(
        f"/api/sessions/{session.id}/turns",
        json={
            "input_type": "action",
            "content": "Я прячу капсулу и спрашиваю, почему у архива охрана.",
            "provider_id": project["active_provider_id"],
            "model_id": project["active_model_id"],
            "temperature": 0.4,
            "top_p": 0.9,
            "reasoning_effort": "medium",
        },
    )
    assert first_turn.status_code == 200
    first_body = first_turn.json()
    assert first_body["user_turn"]["turn_index"] == 2
    assert first_body["ai_turn"]["turn_index"] == 3
    assert first_body["suggested_actions"][0]["label"] == "Спрятать капсулу"
    assert first_body["key_event_candidates"][0]["related_memory_item_ids"] == [character.id]
    assert first_body["key_event_candidates"][0]["related_story_line_ids"] == [line.id]
    assert first_body["memory_proposal_candidates"][0]["source_id"] == first_body["ai_turn"]["id"]
    assert first_body["story_line_update_candidates"][0]["after_state"].startswith("Архив")
    assert adapter.complete_calls[0]["temperature"] == 0.4
    request_payload = json.loads(adapter.complete_calls[0]["messages"][-1].content)
    assert request_payload["action_type"] == "narrate_turn"
    assert request_payload["context"]["session"]["id"] == session.id

    option_id = first_body["suggested_actions"][0]["id"]
    selected_turn = client.post(
        f"/api/sessions/{session.id}/turns",
        json={"input_type": "choice", "selected_option_id": option_id},
    )
    assert selected_turn.status_code == 200
    assert selected_turn.json()["user_turn"]["content"].startswith("Спрятать воспоминание")
    assert story_runtime_store.get_session_suggested_action(session.id, option_id).status == "selected"

    log = client.get(f"/api/sessions/{session.id}/log")
    assert log.status_code == 200
    assert len(log.json()["turns"]) == 5
    assert log.json()["memory_proposals"][0]["status"] == "pending"

    updated_turn = client.patch(
        f"/api/sessions/{session.id}/turns/{first_body['ai_turn']['id']}",
        json={"exclude_from_draft": True},
    )
    assert updated_turn.status_code == 200
    assert updated_turn.json()["exclude_from_draft"] is True

    updated_event = client.patch(
        f"/api/sessions/{session.id}/key-events/{first_body['key_event_candidates'][0]['id']}",
        json={"summary": "Архивариус выдал себя.", "include_in_draft": False},
    )
    assert updated_event.status_code == 200
    assert updated_event.json()["include_in_draft"] is False

    paused = client.post(f"/api/sessions/{session.id}/pause")
    assert paused.status_code == 200
    assert paused.json()["session"]["status"] == "paused"
    resumed = client.post(f"/api/sessions/{session.id}/start")
    assert resumed.status_code == 200
    assert resumed.json()["session"]["status"] == "active"
    completed = client.post(f"/api/sessions/{session.id}/complete")
    assert completed.status_code == 200
    assert completed.json()["session"]["status"] == "completed"
    assert completed.json()["chapter"]["status"] == "session_done"


def test_agent_settings_regenerate_last_and_rollback_modes(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    project = _create_project(client)
    project_id = str(project["id"])
    _character, _line, _chapter, session, _opening = _prepared_session(project_id)
    assert client.post(f"/api/sessions/{session.id}/start").status_code == 200

    settings = client.patch(
        f"/api/sessions/{session.id}/agent-settings",
        json={
            "agent_instructions": "Пиши суше и тревожнее, не ускоряй сцену.",
            "agent_temperature": 0.25,
            "agent_top_p": 0.8,
            "agent_reasoning_effort": "high",
        },
    )
    assert settings.status_code == 200
    assert settings.json()["session"]["agent_temperature"] == 0.25

    adapter = QueueAdapter(
        responses=[
            """
            {
              "narration_markdown": "Старый ответ рассказчика.",
              "suggested_actions": [
                {"label": "Старый вариант", "action": "Сделать старое действие.", "tone": null}
              ],
              "key_event_candidates": [
                {"title": "Старое событие", "summary": "Нужно удалить при регенерации."}
              ],
              "memory_proposal_candidates": [
                {
                  "proposal_type": "new_fact",
                  "title": "Старый факт",
                  "suggested_payload": {"type": "canon_fact"},
                  "reason": "Проверяем очистку хвоста."
                }
              ],
              "story_line_update_candidates": [],
              "warnings": []
            }
            """,
            """
            {
              "suggested_actions": [
                {
                  "label": "Новый вариант",
                  "action": "Проверить щель у двери и прислушаться.",
                  "tone": "осторожно"
                }
              ],
              "warnings": ["Варианты обновлены."]
            }
            """,
            """
            {
              "narration_markdown": "Новый ответ после комментария.",
              "suggested_actions": [],
              "key_event_candidates": [],
              "memory_proposal_candidates": [],
              "story_line_update_candidates": [],
              "warnings": []
            }
            """,
            """
            {
              "narration_markdown": "Ответ после отката к пользовательскому ходу.",
              "suggested_actions": [],
              "key_event_candidates": [],
              "memory_proposal_candidates": [],
              "story_line_update_candidates": [],
              "warnings": []
            }
            """,
        ]
    )
    monkeypatch.setattr(ai_service, "create_adapter", lambda provider, api_key: adapter)

    submitted = client.post(
        f"/api/sessions/{session.id}/turns",
        json={"input_type": "action", "content": "Я проверяю дверь."},
    )
    assert submitted.status_code == 200
    user_turn_id = submitted.json()["user_turn"]["id"]
    assert adapter.complete_calls[0]["temperature"] == 0.25
    assert adapter.complete_calls[0]["top_p"] == 0.8
    assert adapter.complete_calls[0]["reasoning_effort"] == "high"
    first_request = json.loads(adapter.complete_calls[0]["messages"][-1].content)
    assert first_request["context"]["extra"]["agent_settings"]["instructions"].startswith("Пиши суше")

    actions = client.post(
        f"/api/sessions/{session.id}/suggested-actions/regenerate",
        json={"prompt": "Дай более осторожные варианты."},
    )
    assert actions.status_code == 200
    assert actions.json()["suggested_actions"][0]["label"] == "Новый вариант"
    assert story_runtime_store.list_session_suggested_actions(session.id)[0].label == "Новый вариант"
    action_request = json.loads(adapter.complete_calls[1]["messages"][-1].content)
    assert action_request["action_type"] == "suggest_turn_actions"
    assert action_request["input"]["prompt"] == "Дай более осторожные варианты."

    regenerated = client.post(
        f"/api/sessions/{session.id}/turns/regenerate-last",
        json={"comment": "Сделай ответ менее прямолинейным."},
    )
    assert regenerated.status_code == 200
    regenerated_body = regenerated.json()
    assert [turn["content"] for turn in regenerated_body["turns"]] == [
        "Ты стоишь у двери архива.",
        "Я проверяю дверь.",
        "Новый ответ после комментария.",
    ]
    assert regenerated_body["suggested_actions"] == []
    assert regenerated_body["key_events"] == []
    assert regenerated_body["memory_proposals"] == []
    regenerate_request = json.loads(adapter.complete_calls[2]["messages"][-1].content)
    assert regenerate_request["input"]["regeneration_comment"] == "Сделай ответ менее прямолинейным."
    assert len(story_runtime_store.list_memory_proposals(project_id)) == 0

    keep_rollback = client.post(
        f"/api/sessions/{session.id}/rollback",
        json={
            "target_turn_id": user_turn_id,
            "user_turn_mode": "keep",
            "comment": "Сохрани мой ход, но иначе отреагируй.",
        },
    )
    assert keep_rollback.status_code == 200
    assert [turn["content"] for turn in keep_rollback.json()["turns"]] == [
        "Ты стоишь у двери архива.",
        "Я проверяю дверь.",
        "Ответ после отката к пользовательскому ходу.",
    ]

    redo_rollback = client.post(
        f"/api/sessions/{session.id}/rollback",
        json={"target_turn_id": user_turn_id, "user_turn_mode": "redo"},
    )
    assert redo_rollback.status_code == 200
    assert [turn["content"] for turn in redo_rollback.json()["turns"]] == ["Ты стоишь у двери архива."]


def test_read_only_session_reads_work_but_mutations_are_blocked(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    project = project_store.create_project(
        ProjectCreate(title="Read only story", synopsis="Saved narrator log.")
    )
    _character, _line, _chapter, session, opening = _prepared_session(project.id)
    action = story_runtime_store.create_session_suggested_action(
        session.id,
        SessionSuggestedActionCreate(
            source_turn_id=opening.id,
            action_index=1,
            label="Ask",
            action="Ask what happened.",
        ),
    )

    assert client.get(f"/api/sessions/{session.id}").status_code == 200
    assert client.get(f"/api/sessions/{session.id}/turns").status_code == 200
    assert client.get(f"/api/sessions/{session.id}/log").status_code == 200
    assert client.get(f"/api/sessions/{session.id}/key-events").status_code == 200

    blocked = [
        client.post(f"/api/sessions/{session.id}/start"),
        client.post(
            f"/api/sessions/{session.id}/turns",
            json={"input_type": "choice", "selected_option_id": action.id},
        ),
        client.post(f"/api/sessions/{session.id}/pause"),
        client.post(f"/api/sessions/{session.id}/complete"),
        client.patch(
            f"/api/sessions/{session.id}/agent-settings",
            json={"agent_temperature": 0.3},
        ),
        client.post(
            f"/api/sessions/{session.id}/turns/regenerate-last",
            json={"comment": "Try again."},
        ),
        client.post(
            f"/api/sessions/{session.id}/suggested-actions/regenerate",
            json={"comment": "Try options again."},
        ),
        client.post(
            f"/api/sessions/{session.id}/rollback",
            json={"target_turn_id": opening.id, "user_turn_mode": "redo"},
        ),
        client.patch(
            f"/api/sessions/{session.id}/turns/{opening.id}",
            json={"exclude_from_draft": True},
        ),
    ]

    for response in blocked:
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "READ_ONLY_WITHOUT_AI"


def test_narrator_turn_repairs_invalid_structured_output_without_manual_fallback(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    project = _create_project(client)
    _character, _line, _chapter, session, _opening = _prepared_session(str(project["id"]))
    assert client.post(f"/api/sessions/{session.id}/start").status_code == 200

    adapter = QueueAdapter(
        responses=[
            "not json",
            """
            {
              "narration_markdown": "Рассказчик возвращает сцену в связное русло.",
              "suggested_actions": [],
              "key_event_candidates": [],
              "memory_proposal_candidates": [],
              "story_line_update_candidates": [],
              "warnings": []
            }
            """,
        ]
    )
    monkeypatch.setattr(ai_service, "create_adapter", lambda provider, api_key: adapter)

    response = client.post(
        f"/api/sessions/{session.id}/turns",
        json={"input_type": "note", "content": "Что я могу сделать?"},
    )

    assert response.status_code == 200
    assert response.json()["ai_turn"]["content"].startswith("Рассказчик")
    assert len(adapter.complete_calls) == 2
    assert "Repair the invalid AI output" in adapter.complete_calls[1]["messages"][1].content


def test_narrator_session_tables_do_not_store_debug_or_ai_request_logs(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(data_dir))
    client = TestClient(app)
    project = _create_project(client)
    _prepared_session(str(project["id"]))

    response = client.get("/api/ai-actions/definitions")
    assert response.status_code == 200

    with sqlite3.connect(data_dir / "app.db") as connection:
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            ).fetchall()
        }

    assert "session_suggested_actions" in tables
    assert "debug_logs" not in tables
    assert "ai_request_logs" not in tables
    assert not any("prompt" in table or "response" in table for table in tables)
