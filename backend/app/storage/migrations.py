from pathlib import Path
import sqlite3

from app.storage.paths import ensure_data_dirs, get_database_path, get_migrations_dir


def _ensure_migration_table(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version TEXT PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )


def _applied_versions(connection: sqlite3.Connection) -> set[str]:
    rows = connection.execute("SELECT version FROM schema_migrations").fetchall()
    return {row[0] for row in rows}


def _migration_files() -> list[Path]:
    migrations_dir = get_migrations_dir()
    return sorted(migrations_dir.glob("*.sql"))


def apply_migrations() -> list[str]:
    ensure_data_dirs()
    database_path = get_database_path()
    applied: list[str] = []

    with sqlite3.connect(database_path) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        _ensure_migration_table(connection)
        known_versions = _applied_versions(connection)

        for migration_path in _migration_files():
            version = migration_path.stem
            if version in known_versions:
                continue

            connection.executescript(migration_path.read_text(encoding="utf-8"))
            connection.execute(
                "INSERT INTO schema_migrations (version) VALUES (?)",
                (version,),
            )
            applied.append(migration_path.name)

        connection.commit()

    return applied

