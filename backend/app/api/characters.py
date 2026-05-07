from fastapi import APIRouter

router = APIRouter(prefix="/projects/{project_id}/characters", tags=["characters"])
