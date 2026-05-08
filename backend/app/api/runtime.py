from fastapi import APIRouter

from app.models.runtime import RuntimeStatus
from app.services.runtime_status import get_runtime_status

router = APIRouter(prefix="/runtime", tags=["runtime"])


@router.get("/status", response_model=RuntimeStatus)
def runtime_status() -> RuntimeStatus:
    return get_runtime_status()
