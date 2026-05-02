from pathlib import Path
import os


def get_repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def get_data_dir() -> Path:
    configured = os.environ.get("ORYNVAE_DATA_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    return get_repo_root() / "data"


def get_database_path() -> Path:
    return get_data_dir() / "app.db"


def get_migrations_dir() -> Path:
    return get_repo_root() / "backend" / "migrations"


def ensure_data_dirs() -> None:
    data_dir = get_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "projects").mkdir(parents=True, exist_ok=True)
    (data_dir / "backups").mkdir(parents=True, exist_ok=True)

