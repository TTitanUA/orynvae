import json

from fastapi.testclient import TestClient

from app.ai import service as ai_service
from app.main import app
from app.models.projects import ProjectCreate
from app.models.story_runtime import ChapterCreate, MemoryItemCreate, MemoryProposalCreate
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
    model_id = "local-memory-model"
    provider = client.post(
        "/api/providers",
        json={
            "type": "lmstudio",
            "name": "Local Memory AI",
            "default_model_id": model_id,
        },
    ).json()
    provider_store.upsert_models(
        provider["id"],
        [ProviderModel(model_id=model_id, display_name="Local Memory Model")],
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


def test_memory_items_can_be_listed_filtered_updated_and_summarized(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    project = _create_project(client)
    project_id = str(project["id"])

    created = client.post(
        f"/api/projects/{project_id}/memory",
        json={
            "type": "character",
            "title": "Courier",
            "summary": "Carries forbidden memories.",
            "status": "proposed",
            "importance": 2,
        },
    )
    assert created.status_code == 201
    item = created.json()
    story_runtime_store.create_memory_item(
        project_id,
        MemoryItemCreate(
            type="location",
            title="Archive",
            summary="Hidden below the old station.",
            status="canon",
        ),
    )
    story_runtime_store.create_memory_item(
        project_id,
        MemoryItemCreate(
            type="character",
            title="Артем",
            summary="Местный подросток.",
            status="canon",
        ),
    )
    story_runtime_store.create_memory_proposal(
        project_id,
        MemoryProposalCreate(
            proposal_type="update",
            target_item_id=item["id"],
            suggested_payload={"summary": "Carries sealed memories."},
            reason="The synopsis makes the job central.",
        ),
    )
    story_runtime_store.create_chapter(
        project_id,
        ChapterCreate(title="First delivery", order_index=1, status="planned"),
    )

    proposed = client.get(f"/api/projects/{project_id}/memory?requires_confirmation=true")
    assert proposed.status_code == 200
    assert [entry["title"] for entry in proposed.json()] == ["Courier"]

    searched = client.get(f"/api/projects/{project_id}/memory?search=archive&type=location")
    assert searched.status_code == 200
    assert searched.json()[0]["title"] == "Archive"

    cyrillic_search = client.get(f"/api/projects/{project_id}/memory?search=Артем")
    assert cyrillic_search.status_code == 200
    assert cyrillic_search.json()[0]["title"] == "Артем"

    patched = client.patch(
        f"/api/projects/{project_id}/memory/{item['id']}",
        json={"summary": "Carries sealed illegal memories."},
    )
    assert patched.status_code == 200
    assert patched.json()["summary"] == "Carries sealed illegal memories."

    canon = client.post(
        f"/api/projects/{project_id}/memory/{item['id']}/status",
        json={"status": "canon"},
    )
    assert canon.status_code == 200
    assert canon.json()["status"] == "canon"

    summary = client.get(f"/api/projects/{project_id}/workspace-summary")
    assert summary.status_code == 200
    body = summary.json()
    assert body["project"]["id"] == project_id
    assert body["memory_counts"]["total"] == 3
    assert body["memory_counts"]["canon"] == 3
    assert body["memory_counts"]["pending_proposals"] == 1
    assert body["next_step"]["code"] == "prepare_first_chapter"
    assert body["planned_chapter"]["title"] == "First delivery"


def test_memory_proposals_accept_reject_and_defer(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    project = _create_project(client)
    project_id = str(project["id"])
    target = story_runtime_store.create_memory_item(
        project_id,
        MemoryItemCreate(type="character", title="Courier", status="draft"),
    )
    update_proposal = story_runtime_store.create_memory_proposal(
        project_id,
        MemoryProposalCreate(
            proposal_type="update",
            target_item_id=target.id,
            suggested_payload={"summary": "Knows the black-token routes."},
            reason="AI noticed a recurring route detail.",
        ),
    )

    accepted_update = client.post(
        f"/api/projects/{project_id}/memory-proposals/{update_proposal.id}/accept",
        json={
            "target_status": "canon",
            "suggested_payload": {
                "summary": "Knows the sealed black-token routes.",
                "importance": 3,
            },
        },
    )
    assert accepted_update.status_code == 200
    assert accepted_update.json()["proposal"]["status"] == "edited"
    assert accepted_update.json()["memory_item"]["summary"] == "Knows the sealed black-token routes."
    assert accepted_update.json()["memory_item"]["status"] == "canon"

    create_proposal = story_runtime_store.create_memory_proposal(
        project_id,
        MemoryProposalCreate(
            proposal_type="create",
            suggested_payload={
                "type": "canon_fact",
                "title": "Black tokens open forbidden memories",
                "summary": "The tokens grant access to restricted memory archives.",
            },
            reason="The rule should be tracked.",
        ),
    )
    accepted_create = client.post(
        f"/api/projects/{project_id}/memory-proposals/{create_proposal.id}/accept",
        json={"target_status": "draft"},
    )
    assert accepted_create.status_code == 200
    assert accepted_create.json()["proposal"]["status"] == "accepted"
    assert accepted_create.json()["memory_item"]["title"] == "Black tokens open forbidden memories"
    assert accepted_create.json()["memory_item"]["status"] == "draft"

    reject_proposal = story_runtime_store.create_memory_proposal(
        project_id,
        MemoryProposalCreate(proposal_type="contradiction", suggested_payload={"title": "Maybe"}),
    )
    rejected = client.post(
        f"/api/projects/{project_id}/memory-proposals/{reject_proposal.id}/reject",
        json={"status": "rejected"},
    )
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"

    defer_proposal = story_runtime_store.create_memory_proposal(
        project_id,
        MemoryProposalCreate(proposal_type="update", suggested_payload={"title": "Later"}),
    )
    deferred = client.post(
        f"/api/projects/{project_id}/memory-proposals/{defer_proposal.id}/reject",
        json={"status": "deferred"},
    )
    assert deferred.status_code == 200
    assert deferred.json()["status"] == "deferred"


def test_memory_conflict_check_uses_project_memory_context(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    project = _create_project(client)
    project_id = str(project["id"])
    story_runtime_store.create_memory_item(
        project_id,
        MemoryItemCreate(
            type="location",
            title="Archive",
            summary="The archive is below the old station.",
            status="canon",
        ),
    )
    adapter = QueueAdapter(
        responses=[
            """
            {
              "contradictions": [
                {
                  "title": "Archive location mismatch",
                  "description": "The new text places the archive above the market.",
                  "severity": "medium",
                  "related_memory_titles": ["Archive"],
                  "suggestion": "Decide whether the market entrance is a second access point."
                }
              ],
              "warnings": ["Soft warning only"]
            }
            """
        ]
    )
    monkeypatch.setattr(ai_service, "create_adapter", lambda provider, api_key: adapter)

    response = client.post(
        f"/api/projects/{project_id}/memory/check-conflicts",
        json={"content": "The archive tower rises above the market."},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["contradictions"][0]["title"] == "Archive location mismatch"
    assert body["warnings"] == ["Soft warning only"]
    request_payload = json.loads(adapter.complete_calls[0]["messages"][-1].content)
    assert request_payload["action_type"] == "check_contradictions"
    assert request_payload["context"]["memory_items"][0]["title"] == "Archive"


def test_memory_read_only_allows_reads_and_blocks_creative_changes(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    project = project_store.create_project(
        ProjectCreate(title="Read Only", synopsis="A saved story without active AI.")
    )
    memory = story_runtime_store.create_memory_item(
        project.id,
        MemoryItemCreate(type="character", title="Archivist", status="canon"),
    )
    proposal = story_runtime_store.create_memory_proposal(
        project.id,
        MemoryProposalCreate(
            proposal_type="update",
            target_item_id=memory.id,
            suggested_payload={"summary": "Watches the archive."},
        ),
    )

    assert client.get(f"/api/projects/{project.id}").status_code == 200
    assert client.get(f"/api/projects/{project.id}/memory").status_code == 200
    assert client.get(f"/api/projects/{project.id}/memory-proposals").status_code == 200
    summary = client.get(f"/api/projects/{project.id}/workspace-summary")
    assert summary.status_code == 200
    assert summary.json()["runtime"]["read_only"] is True

    blocked_create = client.post(
        f"/api/projects/{project.id}/memory",
        json={"type": "note", "title": "Manual fallback"},
    )
    blocked_status = client.post(
        f"/api/projects/{project.id}/memory/{memory.id}/status",
        json={"status": "draft"},
    )
    blocked_accept = client.post(
        f"/api/projects/{project.id}/memory-proposals/{proposal.id}/accept",
        json={"target_status": "canon"},
    )
    blocked_conflicts = client.post(
        f"/api/projects/{project.id}/memory/check-conflicts",
        json={"content": "New claim"},
    )

    for response in [blocked_create, blocked_status, blocked_accept, blocked_conflicts]:
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "READ_ONLY_WITHOUT_AI"
