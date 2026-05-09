import json
import sqlite3

from fastapi.testclient import TestClient

from app.ai import service as ai_service
from app.main import app
from app.models.projects import ProjectCreate
from app.models.story_runtime import (
    ChapterCreate,
    ChapterSessionCreate,
    ChapterSessionUpdate,
    ChapterUpdate,
    DraftVersionCreate,
    KeyEventCreate,
    MemoryItemCreate,
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
    model_id = "local-stage7-model"
    provider = client.post(
        "/api/providers",
        json={
            "type": "lmstudio",
            "name": "Local Stage 7 AI",
            "default_model_id": model_id,
        },
    ).json()
    provider_store.upsert_models(
        provider["id"],
        [ProviderModel(model_id=model_id, display_name="Local Stage 7 Model")],
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


def _completed_session(project_id: str):
    character = story_runtime_store.create_memory_item(
        project_id,
        MemoryItemCreate(type="character", title="Courier", status="canon"),
    )
    line = story_runtime_store.create_story_line(
        project_id,
        StoryLineCreate(
            type="mystery",
            title="Death memory source",
            current_state="Курьер не знает источник.",
            status="active",
        ),
    )
    chapter = story_runtime_store.create_chapter(
        project_id,
        ChapterCreate(title="Archive Door", order_index=1, status="session_done"),
    )
    session = story_runtime_store.create_chapter_session(
        project_id,
        ChapterSessionCreate(
            chapter_id=chapter.id,
            status="completed",
            user_role="single_character",
            controlled_character_ids=[character.id],
            active_story_line_ids=[line.id],
            tone="tense",
            pace="medium",
            completed_at="2026-05-10T10:00:00Z",
        ),
    )
    chapter = story_runtime_store.update_chapter(
        project_id,
        chapter.id,
        ChapterUpdate(
            session_id=session.id,
        ),
    )
    opening = story_runtime_store.create_session_turn(
        session.id,
        SessionTurnCreate(
            turn_index=1,
            actor_type="ai",
            turn_type="narration",
            content="Ты стоишь у двери архива.",
        ),
    )
    user_turn = story_runtime_store.create_session_turn(
        session.id,
        SessionTurnCreate(
            turn_index=2,
            actor_type="user",
            turn_type="action",
            content="Я прячу капсулу и спрашиваю про охрану.",
            related_memory_item_ids=[character.id],
            related_story_line_ids=[line.id],
        ),
    )
    excluded_turn = story_runtime_store.create_session_turn(
        session.id,
        SessionTurnCreate(
            turn_index=3,
            actor_type="system",
            turn_type="note",
            content="Техническая ошибка не должна попасть в черновик.",
            exclude_from_draft=True,
        ),
    )
    narrator_turn = story_runtime_store.create_session_turn(
        session.id,
        SessionTurnCreate(
            turn_index=4,
            actor_type="ai",
            turn_type="narration",
            content="Архивариус выдает себя взглядом.",
            related_memory_item_ids=[character.id],
            related_story_line_ids=[line.id],
            is_key_event=True,
        ),
    )
    key_event = story_runtime_store.create_key_event(
        project_id,
        KeyEventCreate(
            session_id=session.id,
            chapter_id=chapter.id,
            source_turn_id=narrator_turn.id,
            title="Архивариус узнает капсулу",
            summary="Архивариус заметил воспоминание и скрыл реакцию.",
            related_memory_item_ids=[character.id],
            related_story_line_ids=[line.id],
        ),
    )
    return character, line, chapter, session, opening, user_turn, excluded_turn, key_event


def test_assemble_draft_creates_markdown_version_and_updates_statuses(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    project = _create_project(client)
    project_id = str(project["id"])
    _character, _line, chapter, session, _opening, _user_turn, excluded_turn, key_event = _completed_session(
        project_id
    )

    adapter = QueueAdapter(
        responses=[
            """
            {
              "markdown": "# Archive Door\\n\\nКурьер спрятал капсулу, а архивариус выдал себя взглядом.",
              "warnings": ["Проверить, достаточно ли явно сохранено решение пользователя."]
            }
            """
        ]
    )
    monkeypatch.setattr(ai_service, "create_adapter", lambda provider, api_key: adapter)

    response = client.post(
        f"/api/sessions/{session.id}/assemble-draft",
        json={
            "mode": "faithful",
            "required_event_ids": [key_event.id],
            "excluded_turn_ids": [excluded_turn.id],
            "style_notes": "Сохрани тревожный тон.",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["draft_version"]["markdown"].startswith("# Archive Door")
    assert body["chapter"]["status"] == "draft_generated"
    assert body["chapter"]["draft_markdown"] == body["draft_version"]["markdown"]
    assert body["session"]["status"] == "draft_ready"
    assert story_runtime_store.list_draft_versions(project_id, chapter.id)[0].id == body["draft_version"]["id"]

    ai_payload = json.loads(adapter.complete_calls[0]["messages"][-1].content)
    assert ai_payload["action_type"] == "assemble_draft"
    assert ai_payload["input"]["mode"] == "faithful"
    assert ai_payload["context"]["extra"]["included_key_events"][0]["id"] == key_event.id
    assert excluded_turn.id not in {turn["id"] for turn in ai_payload["context"]["turns"]}


def test_review_apply_forecast_and_orientation_flow(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    project = _create_project(client)
    project_id = str(project["id"])
    _character, line, chapter, session, *_rest = _completed_session(project_id)
    draft = story_runtime_store.create_draft_version(
        project_id,
        DraftVersionCreate(
            chapter_id=chapter.id,
            source_session_id=session.id,
            mode="literary",
            markdown="# Archive Door\n\nКурьер понимает, что архив связан с капсулой.",
        ),
    )
    story_runtime_store.update_chapter(
        project_id,
        chapter.id,
        ChapterUpdate(
            status="draft_generated",
            draft_markdown=draft.markdown,
            session_id=session.id,
        ),
    )
    story_runtime_store.update_chapter_session(
        project_id,
        session.id,
        ChapterSessionUpdate(status="draft_ready"),
    )

    adapter = QueueAdapter(
        responses=[
            """
            {
              "summary": "Курьер понял, что архив связан с капсулой.",
              "memory_proposals": [
                {
                  "proposal_type": "new_fact",
                  "title": "Архив связан с капсулой",
                  "suggested_payload": {
                    "type": "canon_fact",
                    "summary": "Архивариус узнал капсулу запрещенного воспоминания."
                  },
                  "reason": "Это ключевой след после главы."
                }
              ],
              "story_line_updates": [
                {
                  "title": "Death memory source",
                  "before_state": "Курьер не знает источник.",
                  "after_state": "Архив может быть связан с капсулой.",
                  "event_summary": "Реакция архивариуса стала новым следом.",
                  "reason": "Линия тайны продвинулась."
                }
              ],
              "contradictions": [
                {
                  "title": "Слишком быстрое раскрытие",
                  "description": "Черновик почти раскрывает источник тайны.",
                  "severity": "medium",
                  "related_memory_titles": [],
                  "suggestion": "Оставить это как подозрение."
                }
              ],
              "open_questions": [
                {
                  "question": "Кто еще видел капсулу?",
                  "why": "Это может двигать следующую главу."
                }
              ],
              "warnings": []
            }
            """,
            """
            {
              "summary": "Следующая глава может развить тайну архива без фиксации финала.",
              "options": [
                {
                  "title": "Пойти к архивариусу",
                  "description": "Курьер проверяет реакцию архивариуса.",
                  "likely_consequences": ["Тайна получает новый след"],
                  "related_story_line_titles": ["Death memory source"],
                  "risks": ["Архив заметит подозрения"]
                },
                {
                  "title": "Проверить рынок воспоминаний",
                  "description": "Курьер ищет путь капсулы через рынок.",
                  "likely_consequences": ["Угроза становится шире"],
                  "related_story_line_titles": ["Death memory source"],
                  "risks": ["След может оказаться ложным"]
                }
              ],
              "warnings": []
            }
            """,
        ]
    )
    monkeypatch.setattr(ai_service, "create_adapter", lambda provider, api_key: adapter)

    review_response = client.post(
        f"/api/projects/{project_id}/chapters/{chapter.id}/review",
        json={"source_draft_version_id": draft.id},
    )
    assert review_response.status_code == 200
    review_body = review_response.json()
    assert review_body["review"]["summary"].startswith("Курьер понял")
    assert review_body["memory_proposals"][0]["source_type"] == "chapter_review"
    assert review_body["story_line_updates"][0]["target_story_line_id"] == line.id
    assert {note["note_type"] for note in review_body["notes"]} == {"contradiction", "open_question"}

    proposal_id = review_body["memory_proposals"][0]["id"]
    line_update_id = review_body["story_line_updates"][0]["id"]
    note_decisions = [
        {"note_id": note["id"], "status": "resolved", "decision_note": "Проверено."}
        for note in review_body["notes"]
    ]
    apply_payload = {
        "review_id": review_body["review"]["id"],
        "memory_decisions": [{"proposal_id": proposal_id, "status": "accepted"}],
        "story_line_decisions": [
            {"update_id": line_update_id, "status": "accepted", "target_story_line_id": line.id}
        ],
        "note_decisions": note_decisions,
    }
    apply_response = client.post(
        f"/api/projects/{project_id}/chapters/{chapter.id}/review/apply",
        json=apply_payload,
    )
    assert apply_response.status_code == 200
    applied = apply_response.json()
    assert applied["review"]["status"] == "applied"
    assert applied["chapter"]["status"] == "completed"
    assert story_runtime_store.get_chapter_session(project_id, session.id).status == "reviewed"
    assert story_runtime_store.get_story_line(project_id, line.id).current_state.startswith("Архив")
    assert story_runtime_store.list_story_line_progress(project_id, line.id)[0].after_state.startswith("Архив")
    progress_count = len(story_runtime_store.list_story_line_progress(project_id, line.id))

    repeated_apply = client.post(
        f"/api/projects/{project_id}/chapters/{chapter.id}/review/apply",
        json=apply_payload,
    )
    assert repeated_apply.status_code == 200
    assert len(story_runtime_store.list_story_line_progress(project_id, line.id)) == progress_count

    forecast_response = client.post(
        f"/api/projects/{project_id}/forecast",
        json={"source_chapter_id": chapter.id, "horizon_chapters": 2, "active_story_line_ids": [line.id]},
    )
    assert forecast_response.status_code == 200
    forecast = forecast_response.json()
    assert len(forecast["options"]) == 2
    assert forecast["options"][0]["related_story_line_ids"] == [line.id]

    selected = client.post(
        f"/api/projects/{project_id}/forecasts/{forecast['id']}/options/{forecast['options'][1]['id']}/select"
    )
    assert selected.status_code == 200
    assert [option["is_selected_as_orientation"] for option in selected.json()["options"]] == [False, True]


def test_forecast_requires_saved_draft_before_calling_ai(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    project = _create_project(client)
    project_id = str(project["id"])
    _character, line, chapter, _session, *_rest = _completed_session(project_id)
    adapter = QueueAdapter(responses=[])
    monkeypatch.setattr(ai_service, "create_adapter", lambda provider, api_key: adapter)

    response = client.post(
        f"/api/projects/{project_id}/forecast",
        json={"source_chapter_id": chapter.id, "active_story_line_ids": [line.id]},
    )

    assert response.status_code == 409
    assert "no draft markdown" in response.json()["detail"]
    assert adapter.complete_calls == []


def test_stage7_reads_work_without_ai_but_mutations_are_blocked(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    project = project_store.create_project(
        ProjectCreate(title="Read only stage 7", synopsis="Saved draft.")
    )
    _character, _line, chapter, session, *_rest = _completed_session(project.id)
    draft = story_runtime_store.create_draft_version(
        project.id,
        DraftVersionCreate(
            chapter_id=chapter.id,
            source_session_id=session.id,
            markdown="# Saved draft",
        ),
    )

    assert client.get(f"/api/projects/{project.id}/chapters/{chapter.id}/draft-versions").status_code == 200
    assert client.get(f"/api/projects/{project.id}/forecasts").status_code == 200

    blocked = [
        client.post(f"/api/sessions/{session.id}/assemble-draft", json={}),
        client.patch(
            f"/api/projects/{project.id}/chapters/{chapter.id}/draft",
            json={"markdown": "# Edited"},
        ),
        client.post(
            f"/api/projects/{project.id}/chapters/{chapter.id}/draft/assist",
            json={"selection_markdown": "Saved", "instructions": "Rewrite"},
        ),
        client.post(
            f"/api/projects/{project.id}/chapters/{chapter.id}/review",
            json={"source_draft_version_id": draft.id},
        ),
        client.post(
            f"/api/projects/{project.id}/forecast",
            json={"source_chapter_id": chapter.id},
        ),
    ]

    for response in blocked:
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "READ_ONLY_WITHOUT_AI"

    with sqlite3.connect(tmp_path / "data" / "app.db") as connection:
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            ).fetchall()
        }
    assert "debug_logs" not in tables
    assert "ai_request_logs" not in tables
