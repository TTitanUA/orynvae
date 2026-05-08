import sqlite3

from app.storage.migrations import apply_migrations
from app.storage.paths import get_migrations_dir


def test_apply_migrations_creates_initial_tables(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(data_dir))

    applied = apply_migrations()

    assert "001_initial.sql" in applied
    assert "002_provider_state.sql" in applied
    assert "004_provider_model_preferences.sql" in applied
    assert "007_v2_runtime_schema.sql" in applied
    with sqlite3.connect(data_dir / "app.db") as connection:
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            ).fetchall()
        }
        provider_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(model_providers)").fetchall()
        }
        provider_model_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(provider_models)").fetchall()
        }
        project_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(projects)").fetchall()
        }
        chapter_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(chapters)").fetchall()
        }
        draft_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(draft_versions)").fetchall()
        }

    assert "projects" in tables
    assert "model_providers" in tables
    assert "app_settings" in tables
    assert "schema_migrations" in tables
    assert {
        "memory_items",
        "memory_relations",
        "memory_proposals",
        "story_lines",
        "story_line_progress",
        "chapters",
        "chapter_sessions",
        "session_turns",
        "key_events",
        "draft_versions",
        "forecasts",
        "forecast_options",
    }.issubset(tables)
    assert "characters" not in tables
    assert "canon_facts" not in tables
    assert "debug_logs" not in tables
    assert "ai_request_logs" not in tables
    assert not any("prompt" in table or "response" in table for table in tables)
    assert "is_enabled" in provider_columns
    assert "is_default" in provider_columns
    assert "is_allowed" in provider_model_columns
    assert "routing_config_json" in provider_model_columns
    assert project_columns == {
        "id",
        "title",
        "synopsis",
        "status",
        "active_provider_id",
        "active_model_id",
        "expansion_policy",
        "created_at",
        "updated_at",
        "archived_at",
    }
    assert "draft_markdown" in chapter_columns
    assert "final_markdown" in chapter_columns
    assert "markdown" in draft_columns


def test_v2_project_migration_replaces_legacy_projects(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(data_dir))
    database_path = data_dir / "app.db"

    with sqlite3.connect(database_path) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute(
            """
            CREATE TABLE schema_migrations (
              version TEXT PRIMARY KEY,
              applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        for migration_path in sorted(get_migrations_dir().glob("00[1-6]_*.sql")):
            connection.executescript(migration_path.read_text(encoding="utf-8"))
            connection.execute(
                "INSERT INTO schema_migrations (version) VALUES (?)",
                (migration_path.stem,),
            )
        connection.execute("INSERT INTO projects (id, name, is_hidden) VALUES ('legacy', 'Old', 1)")
        connection.commit()

    applied = apply_migrations()

    assert applied == ["007_v2_runtime_schema.sql"]
    with sqlite3.connect(database_path) as connection:
        project_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(projects)").fetchall()
        }
        rows = connection.execute("SELECT * FROM projects").fetchall()
        provider_tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('model_providers', 'provider_models')"
            ).fetchall()
        }

    assert "name" not in project_columns
    assert "is_hidden" not in project_columns
    assert {"title", "synopsis", "status", "expansion_policy"}.issubset(project_columns)
    assert rows == []
    assert provider_tables == {"model_providers", "provider_models"}
