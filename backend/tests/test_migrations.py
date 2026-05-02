import sqlite3

from app.storage.migrations import apply_migrations


def test_apply_migrations_creates_initial_tables(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(data_dir))

    applied = apply_migrations()

    assert "001_initial.sql" in applied
    assert "002_provider_state.sql" in applied
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

    assert "projects" in tables
    assert "model_providers" in tables
    assert "canon_facts" in tables
    assert "schema_migrations" in tables
    assert "is_enabled" in provider_columns
    assert "is_default" in provider_columns
