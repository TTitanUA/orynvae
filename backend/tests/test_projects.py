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

