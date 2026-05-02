from fastapi import APIRouter

from app.core.config import APP_NAME, APP_VERSION
from app.storage.paths import ensure_data_dirs, get_database_path, get_data_dir

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check() -> dict[str, object]:
    ensure_data_dirs()
    database_path = get_database_path()

    return {
        "status": "ok",
        "service": APP_NAME,
        "version": APP_VERSION,
        "data_dir": str(get_data_dir()),
        "database_path": str(database_path),
        "database_exists": database_path.exists(),
    }

