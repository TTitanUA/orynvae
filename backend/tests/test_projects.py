from fastapi.testclient import TestClient

from app.api import projects as projects_api
from app.main import app


class FakeProjectSetupAdapter:
    async def complete_chat(self, *, model_id, messages, temperature):
        return """
        {
          "title": "Город под стеклянным небом",
          "description": "Камерная sci-fi история о памяти.",
          "synopsis": "Архивистка находит город, где воспоминания стали валютой.",
          "genre": "science fantasy",
          "tone": "melancholy wonder",
          "setting": "floating archive city",
          "format": "novella",
          "central_conflict": "truth versus comfort",
          "themes": ["memory", "identity"],
          "directions": ["start with the forbidden archive", "make the mentor unreliable"],
          "target_length": "short novel",
          "point_of_view": "close third"
        }
        """


class FakeChapterAdapter:
    async def complete_chat(self, *, model_id, messages, temperature):
        return f"complete:{model_id}:{messages[-1].content[:18]}"

    async def stream_chat(self, *, model_id, messages, temperature):
        yield "streamed "
        yield "chapter help"


def test_project_setup_fallback_and_create(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)

    analyzed = client.post(
        "/api/projects/setup/analyze",
        json={"idea_text": "A cartographer maps dreams for a city that forgot the sea."},
    )

    assert analyzed.status_code == 200
    analysis = analyzed.json()
    assert analysis["title"].startswith("A cartographer maps")
    assert analysis["warnings"]

    created = client.post(
        "/api/projects/setup",
        json={
            "name": analysis["title"],
            "idea_text": "A cartographer maps dreams for a city that forgot the sea.",
            "description": analysis["description"],
            "synopsis": analysis["synopsis"],
            "genre": analysis["genre"],
            "tone": analysis["tone"],
            "setting": analysis["setting"],
            "format": analysis["format"],
            "central_conflict": analysis["central_conflict"],
            "directions": analysis["directions"],
        },
    )

    assert created.status_code == 201
    project = created.json()
    assert project["name"] == analysis["title"]
    assert project["settings"]["format"] == "Новелла"

    listed = client.get("/api/projects")
    assert listed.status_code == 200
    assert listed.json()[0]["id"] == project["id"]


def test_project_setup_ai_analysis_uses_selected_provider(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setattr(
        projects_api,
        "create_adapter",
        lambda provider, api_key: FakeProjectSetupAdapter(),
    )
    client = TestClient(app)

    provider = client.post(
        "/api/providers",
        json={"type": "lmstudio", "name": "Local setup model", "default_model_id": "story"},
    ).json()

    analyzed = client.post(
        "/api/projects/setup/analyze",
        json={
            "idea_text": "Архивистка ищет украденные воспоминания.",
            "provider_id": provider["id"],
            "model_id": "story",
        },
    )

    assert analyzed.status_code == 200
    body = analyzed.json()
    assert body["title"] == "Город под стеклянным небом"
    assert body["themes"] == ["memory", "identity"]
    assert body["warnings"] == []


def test_project_workspace_round_trip(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)

    project = client.post(
        "/api/projects/setup",
        json={
            "name": "Archive City",
            "idea_text": "A cartographer maps dreams.",
            "description": "Dream maps for a city.",
            "synopsis": "A city searches for the sea it forgot.",
            "genre": "science fantasy",
            "tone": "quiet wonder",
            "setting": "floating archive",
            "format": "novella",
            "central_conflict": "truth versus comfort",
            "themes": ["memory"],
            "directions": ["open in the archive"],
            "selected_direction": "open in the archive",
        },
    ).json()

    loaded = client.get(f"/api/projects/{project['id']}/workspace")

    assert loaded.status_code == 200
    workspace = loaded.json()
    assert workspace["project"]["name"] == "Archive City"
    assert workspace["idea_lab"]["directions"] == ["open in the archive"]

    saved = client.put(
        f"/api/projects/{project['id']}/workspace",
        json={
            "name": "Archive City Revised",
            "description": "A sharper project brief.",
            "synopsis": "The mapmaker discovers who erased the ocean.",
            "settings": {
                "genre": "fantasy mystery",
                "tone": "luminous",
                "setting": "library archipelago",
                "format": "short novel",
                "central_conflict": "memory versus power",
                "themes": ["memory", "agency"],
                "target_length": "70k",
                "point_of_view": "close third",
            },
            "idea_lab": {
                "source_text": "A mapmaker and a lost sea.",
                "expanded_synopsis": "The city begins to dream in tides.",
                "selected_direction": "start with a forbidden map",
                "directions": ["start with a forbidden map"],
                "themes": ["memory", "agency"],
                "motives": ["recover the erased archive"],
                "conflicts": ["public history versus private grief"],
            },
            "world_bible": {
                "rules": [
                    {
                        "title": "Dream maps are legal records",
                        "content": "A map can rewrite civic memory.",
                        "canon_status": "canon",
                    }
                ],
                "locations": [{"title": "North Stack", "content": "A tower of tidal shelves."}],
                "factions": [{"title": "The Index", "content": "Archivists who police memory."}],
            },
            "characters": [
                {
                    "name": "Mira",
                    "role": "cartographer",
                    "biography": "Raised among sealed indexes.",
                    "motivation": "Find the first map.",
                    "goal": "Restore the sea.",
                    "fear": "Becoming the city's censor.",
                    "internal_conflict": "Truth may hurt the people she protects.",
                }
            ],
            "plot_board": {
                "arcs": [
                    {
                        "title": "Memory arc",
                        "description": "From obedient mapper to witness.",
                        "arc_type": "main",
                        "position": 0,
                    }
                ],
                "chapters": [
                    {
                        "title": "The Saltless Harbor",
                        "summary": "Mira finds a map that smells like rain.",
                        "status": "planned",
                        "position": 0,
                    }
                ],
            },
        },
    )

    assert saved.status_code == 200
    body = saved.json()
    assert body["project"]["name"] == "Archive City Revised"
    assert body["settings"]["themes"] == ["memory", "agency"]
    assert body["world_bible"]["rules"][0]["title"] == "Dream maps are legal records"
    assert body["characters"][0]["name"] == "Mira"
    assert body["plot_board"]["chapters"][0]["status"] == "planned"


def test_chapter_editor_round_trip_and_ai_assist(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setattr(projects_api, "create_adapter", lambda provider, api_key: FakeChapterAdapter())
    client = TestClient(app)

    provider = client.post(
        "/api/providers",
        json={"type": "lmstudio", "name": "Chapter model", "default_model_id": "draft"},
    ).json()
    project = client.post(
        "/api/projects/setup",
        json={
            "name": "Archive City",
            "idea_text": "A cartographer maps dreams.",
            "description": "Dream maps for a city.",
            "synopsis": "A city searches for the sea it forgot.",
            "provider_id": provider["id"],
            "model_id": "draft",
        },
    ).json()

    saved = client.put(
        f"/api/projects/{project['id']}/chapter-editor",
        json={
            "chapters": [
                {
                    "id": "chapter-1",
                    "title": "The Saltless Harbor",
                    "summary": "Mira finds a map that smells like rain.",
                    "status": "draft",
                    "position": 0,
                    "body": "Mira opened the forbidden atlas.",
                    "scenes": [
                        {
                            "id": "scene-1",
                            "title": "The map room",
                            "summary": "A hidden shelf moves.",
                            "body": "Dust lifted from the brass rails.",
                            "position": 0,
                        }
                    ],
                }
            ]
        },
    )

    assert saved.status_code == 200
    body = saved.json()
    assert body["chapters"][0]["body"] == "Mira opened the forbidden atlas."
    assert body["chapters"][0]["scenes"][0]["title"] == "The map room"

    loaded = client.get(f"/api/projects/{project['id']}/chapter-editor")
    assert loaded.status_code == 200
    assert loaded.json()["chapters"][0]["scenes"][0]["body"] == "Dust lifted from the brass rails."

    streamed = client.post(
        f"/api/projects/{project['id']}/chapter-editor/assist",
        json={
            "action": "continue",
            "chapter_id": "chapter-1",
            "scene_id": "scene-1",
            "draft_text": "Dust lifted from the brass rails.",
            "stream": True,
        },
    )

    assert streamed.status_code == 200
    assert streamed.text == "streamed chapter help"
