from fastapi.testclient import TestClient

from app.main import app


def _project(client: TestClient, name: str = "Characters") -> dict:
    response = client.post("/api/projects", json={"name": name})
    assert response.status_code == 201
    return response.json()


def _character(client: TestClient, project_id: str, **overrides) -> dict:
    payload = {
        "name": "Mira",
        "gender": "female",
        "age": "about 30",
        "role": "cartographer",
        **overrides,
    }
    response = client.post(f"/api/projects/{project_id}/characters", json=payload)
    assert response.status_code == 201
    return response.json()


def test_character_crud_and_relationship_validation(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    project = _project(client)
    mira = _character(client, project["id"], name="Mira")
    noa = _character(client, project["id"], name="Noa", gender="nonbinary")

    updated = client.patch(
        f"/api/projects/{project['id']}/characters/{mira['id']}",
        json={
            "role": "archive rebel",
            "relationships": [
                {
                    "target_character_id": noa["id"],
                    "relationship_type": "ally",
                    "description": "They trade forbidden maps.",
                }
            ],
        },
    )

    assert updated.status_code == 200
    body = updated.json()
    assert body["role"] == "archive rebel"
    assert body["relationships"][0]["target_character_id"] == noa["id"]
    assert body["relationships"][0]["target_character_name"] == "Noa"

    listed = client.get(f"/api/projects/{project['id']}/characters")
    assert listed.status_code == 200
    assert {
        character["name"]: len(character["relationships"])
        for character in listed.json()
    } == {"Mira": 1, "Noa": 1}

    self_relation = client.patch(
        f"/api/projects/{project['id']}/characters/{mira['id']}",
        json={
            "relationships": [
                {"target_character_id": mira["id"], "relationship_type": "mirror"}
            ]
        },
    )
    assert self_relation.status_code == 422

    deleted = client.delete(f"/api/projects/{project['id']}/characters/{noa['id']}")
    assert deleted.status_code == 204
    loaded = client.get(f"/api/projects/{project['id']}/characters/{mira['id']}")
    assert loaded.status_code == 200
    assert loaded.json()["relationships"] == []


def test_character_relationship_cannot_cross_project(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    first_project = _project(client, "First")
    second_project = _project(client, "Second")
    first_character = _character(client, first_project["id"], name="First hero")
    second_character = _character(client, second_project["id"], name="Second hero")

    response = client.patch(
        f"/api/projects/{first_project['id']}/characters/{first_character['id']}",
        json={
            "relationships": [
                {
                    "target_character_id": second_character["id"],
                    "relationship_type": "impossible",
                }
            ]
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Target character does not belong to this project"


def test_character_bulk_create_is_transactional(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    project = _project(client)

    failed = client.post(
        f"/api/projects/{project['id']}/characters/bulk",
        json={
            "characters": [
                {"draft_id": "draft-1", "name": "Mira"},
                {"draft_id": "draft-2", "name": "Noa"},
            ],
            "relationships": [
                {
                    "source_draft_id": "draft-1",
                    "target_draft_id": "missing",
                    "relationship_type": "ally",
                }
            ],
        },
    )

    assert failed.status_code == 422
    listed = client.get(f"/api/projects/{project['id']}/characters")
    assert listed.status_code == 200
    assert listed.json() == []

    created = client.post(
        f"/api/projects/{project['id']}/characters/bulk",
        json={
            "characters": [
                {"draft_id": "draft-1", "name": "Mira", "age": "about 30"},
                {"draft_id": "draft-2", "name": "Noa", "role": "pilot"},
            ],
            "relationships": [
                {
                    "source_draft_id": "draft-1",
                    "target_draft_id": "draft-2",
                    "relationship_type": "ally",
                    "description": "They share a route.",
                }
            ],
        },
    )

    assert created.status_code == 201
    body = created.json()
    assert [character["name"] for character in body["characters"]] == ["Mira", "Noa"]
    assert body["relationships"][0]["source_character_name"] == "Mira"
    assert body["relationships"][0]["target_character_name"] == "Noa"


def test_workspace_save_preserves_character_ids_new_fields_and_relationships(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    project = _project(client)
    mira = _character(client, project["id"], name="Mira", gender="female", age="ancient")
    noa = _character(
        client,
        project["id"],
        name="Noa",
        relationships=[
            {
                "target_character_id": mira["id"],
                "relationship_type": "student",
                "description": "Noa learned forbidden navigation from Mira.",
            }
        ],
    )

    saved = client.put(
        f"/api/projects/{project['id']}/workspace",
        json={
            "characters": [
                {"id": mira["id"], "name": "Mira Revised", "role": "mentor"},
                {"id": noa["id"], "name": "Noa", "role": "pilot"},
            ]
        },
    )

    assert saved.status_code == 200
    characters = saved.json()["characters"]
    assert {character["id"] for character in characters} == {mira["id"], noa["id"]}
    revised = next(character for character in characters if character["id"] == mira["id"])
    assert revised["gender"] == "female"
    assert revised["age"] == "ancient"

    loaded_noa = client.get(f"/api/projects/{project['id']}/characters/{noa['id']}")
    assert loaded_noa.status_code == 200
    assert loaded_noa.json()["relationships"][0]["target_character_id"] == mira["id"]


def test_character_assist_fallbacks(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    client = TestClient(app)
    project = _project(client)
    existing = _character(client, project["id"], name="Mira")

    drafted = client.post(
        f"/api/projects/{project['id']}/characters/assist/bulk-draft",
        json={
            "prompt": "Noa, nonbinary, 22, pilot\nMira - mentor - Noa",
            "include_relationships": True,
        },
    )

    assert drafted.status_code == 200
    draft_body = drafted.json()
    assert draft_body["characters"][0]["name"] == "Noa"
    assert draft_body["warnings"]

    assisted = client.post(
        f"/api/projects/{project['id']}/characters/assist/profile",
        json={
            "character_id": existing["id"],
            "draft": {"name": "Mira", "role": "cartographer"},
            "mode": "expand",
        },
    )

    assert assisted.status_code == 200
    assist_body = assisted.json()
    assert assist_body["patch"]["biography"]
    assert assist_body["warnings"]
