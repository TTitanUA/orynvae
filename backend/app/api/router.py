from fastapi import APIRouter

from app.api import health, projects, providers

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(providers.router)
api_router.include_router(projects.router)
