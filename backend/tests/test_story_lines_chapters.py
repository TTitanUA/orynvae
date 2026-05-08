import json

from fastapi.testclient import TestClient

from app.ai import service as ai_service
from app.main import app
from app.models.projects import ProjectCreate
from app.models.story_runtime import ChapterCreate, MemoryItemCreate, StoryLineCreate, StoryLineProgressCreate
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
    model_id = "local-lines-model"
    provider = client.post(
        "/api/providers",
        json={
            "type": "lmstudio",
            "name": "Local Lines AI",
            "default_model_id": model_id,
        },
    ).json()
    provider_store.upsert_models(
        provider["id"],
        [ProviderModel(model_id=model_id, display_name="Local Lines Model")],
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


def test_story_lines_can_be_managed_suggested_and_read_with_progress(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    project = _create_project(client)
    project_id = str(project["id"])
    chapter = story_runtime_store.create_chapter(
        project_id,
        ChapterCreate(title="Delivery", order_index=1, status="planned"),
    )

    created = client.post(
        f"/api/projects/{project_id}/story-lines",
        json={
            "type": "mystery",
            "title": "Who sent the death memory?",
            "description": "The source stays unclear.",
            "status": "proposed",
            "priority": 2,
        },
    )
    assert created.status_code == 201
    line = created.json()

    story_runtime_store.create_story_line_progress(
        project_id,
        StoryLineProgressCreate(
            story_line_id=line["id"],
            chapter_id=chapter.id,
            before_state="The courier has only the memory.",
            after_state="The archive mark appears on the package.",
            event_summary="A new clue points toward the archive.",
        ),
    )

    listed = client.get(f"/api/projects/{project_id}/story-lines?status=proposed&search=death")
    assert listed.status_code == 200
    assert [entry["title"] for entry in listed.json()] == ["Who sent the death memory?"]

    fetched = client.get(f"/api/projects/{project_id}/story-lines/{line['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["title"] == "Who sent the death memory?"

    patched = client.patch(
        f"/api/projects/{project_id}/story-lines/{line['id']}",
        json={"current_state": "The archive may be involved."},
    )
    assert patched.status_code == 200
    assert patched.json()["current_state"] == "The archive may be involved."

    active = client.post(
        f"/api/projects/{project_id}/story-lines/{line['id']}/status",
        json={"status": "active"},
    )
    assert active.status_code == 200
    assert active.json()["status"] == "active"

    progress = client.get(f"/api/projects/{project_id}/story-lines/{line['id']}/progress")
    assert progress.status_code == 200
    assert progress.json()["progress"][0]["event_summary"] == "A new clue points toward the archive."

    adapter = QueueAdapter(
        responses=[
            """
            {
              "story_lines": [
                {
                  "type": "threat",
                  "title": "Archive starts watching",
                  "description": "The city archive notices the courier.",
                  "current_state": "The courier is not yet identified.",
                  "priority": 1,
                  "reason": "The synopsis has institutional pressure."
                }
              ],
              "warnings": ["Keep it soft."]
            }
            """
        ]
    )
    monkeypatch.setattr(ai_service, "create_adapter", lambda provider, api_key: adapter)
    suggested = client.post(
        f"/api/projects/{project_id}/story-lines/suggest",
        json={
            "instructions": "Suggest one threat line.",
            "max_suggestions": 1,
            "provider_id": project["active_provider_id"],
            "model_id": project["active_model_id"],
            "temperature": 0.35,
            "top_p": 0.8,
            "reasoning_effort": "medium",
        },
    )
    assert suggested.status_code == 200
    assert suggested.json()["story_lines"][0]["title"] == "Archive starts watching"
    assert len(story_runtime_store.list_story_lines(project_id)) == 1
    assert adapter.complete_calls[0]["model_id"] == project["active_model_id"]
    assert adapter.complete_calls[0]["temperature"] == 0.35
    assert adapter.complete_calls[0]["top_p"] == 0.8
    assert adapter.complete_calls[0]["reasoning_effort"] == "medium"
    request_payload = json.loads(adapter.complete_calls[0]["messages"][-1].content)
    assert request_payload["action_type"] == "suggest_story_lines"
    assert request_payload["context"]["story_lines"][0]["title"] == "Who sent the death memory?"


def test_chapters_can_be_prepared_into_saved_session_frame(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    project = _create_project(client)
    project_id = str(project["id"])
    character = story_runtime_store.create_memory_item(
        project_id,
        MemoryItemCreate(type="character", title="Courier", status="canon"),
    )
    line = story_runtime_store.create_story_line(
        project_id,
        StoryLineCreate(type="mystery", title="Death memory source", status="active"),
    )

    created = client.post(
        f"/api/projects/{project_id}/chapters",
        json={"synopsis": "Start at the memory market."},
    )
    assert created.status_code == 201
    chapter = created.json()
    assert chapter["title"] == "Глава 1"

    patched = client.patch(
        f"/api/projects/{project_id}/chapters/{chapter['id']}",
        json={"title": "First Delivery"},
    )
    assert patched.status_code == 200
    assert patched.json()["title"] == "First Delivery"

    adapter = QueueAdapter(
        responses=[
            """
            {
              "narrator_opening": "Ты стоишь у входа в архив, держа чужое воспоминание.",
              "suggested_actions": [
                {
                  "label": "Спрятать воспоминание",
                  "action": "Спрятать капсулу и дождаться, кто придет за ней.",
                  "tone": "осторожно"
                }
              ],
              "relevant_memory_titles": ["Courier"],
              "chapter_intention": "Проверить, кому можно доверять.",
              "start_situation": "У архива слишком много охраны.",
              "participant_titles": ["Courier"],
              "possible_line_movements": ["Дать новый след к источнику воспоминания."],
              "coherence_risks": ["Не раскрывать отправителя слишком рано."],
              "warnings": []
            }
            """
        ]
    )
    monkeypatch.setattr(ai_service, "create_adapter", lambda provider, api_key: adapter)

    prepared = client.post(
        f"/api/projects/{project_id}/chapters/{chapter['id']}/session/prepare",
        json={
            "title": "Archive Door",
            "focus": "Проверить доверие между курьером и архивариусом.",
            "user_role": "single_character",
            "controlled_character_ids": [character.id],
            "primary_story_line_id": line.id,
            "secondary_story_line_ids": [],
            "tone": "тревожный",
            "pace": "medium",
            "start_point": "Курьер замечает охрану у архива.",
            "provider_id": project["active_provider_id"],
            "model_id": project["active_model_id"],
            "temperature": 0.4,
            "top_p": 0.85,
            "reasoning_effort": "high",
        },
    )

    assert prepared.status_code == 200
    body = prepared.json()
    assert body["session"]["status"] == "preparing"
    assert body["session"]["active_story_line_ids"] == [line.id]
    assert body["opening_turn"]["content"].startswith("Ты стоишь")
    assert body["chapter"]["session_id"] == body["session"]["id"]
    assert story_runtime_store.list_session_turns(body["session"]["id"])[0].turn_type == "narration"
    assert adapter.complete_calls[0]["model_id"] == project["active_model_id"]
    assert adapter.complete_calls[0]["temperature"] == 0.4
    assert adapter.complete_calls[0]["top_p"] == 0.85
    assert adapter.complete_calls[0]["reasoning_effort"] == "high"
    request_payload = json.loads(adapter.complete_calls[0]["messages"][-1].content)
    assert request_payload["action_type"] == "prepare_chapter_session"
    assert request_payload["input"]["primary_story_line_id"] == line.id


def test_story_line_and_chapter_reads_work_without_ai_but_mutations_are_blocked(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    project = project_store.create_project(
        ProjectCreate(title="Read Only", synopsis="A saved story without active AI.")
    )
    line = story_runtime_store.create_story_line(
        project.id,
        StoryLineCreate(type="theme", title="Memory as identity", status="active"),
    )
    chapter = story_runtime_store.create_chapter(
        project.id,
        ChapterCreate(title="Saved chapter", order_index=1, status="planned"),
    )

    assert client.get(f"/api/projects/{project.id}/story-lines").status_code == 200
    assert client.get(f"/api/projects/{project.id}/story-lines/{line.id}/progress").status_code == 200
    assert client.get(f"/api/projects/{project.id}/chapters").status_code == 200
    assert client.get(f"/api/projects/{project.id}/chapters/{chapter.id}").status_code == 200

    blocked = [
        client.post(
            f"/api/projects/{project.id}/story-lines",
            json={"type": "custom", "title": "Manual fallback"},
        ),
        client.patch(
            f"/api/projects/{project.id}/story-lines/{line.id}",
            json={"current_state": "Changed"},
        ),
        client.post(
            f"/api/projects/{project.id}/story-lines/{line.id}/status",
            json={"status": "sleeping"},
        ),
        client.post(f"/api/projects/{project.id}/story-lines/suggest", json={}),
        client.post(f"/api/projects/{project.id}/chapters", json={"title": "New"}),
        client.patch(
            f"/api/projects/{project.id}/chapters/{chapter.id}",
            json={"title": "Changed"},
        ),
        client.post(
            f"/api/projects/{project.id}/chapters/{chapter.id}/session/prepare",
            json={"user_role": "author"},
        ),
    ]

    for response in blocked:
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "READ_ONLY_WITHOUT_AI"
