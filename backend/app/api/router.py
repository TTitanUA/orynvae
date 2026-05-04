from fastapi import APIRouter

from app.api import debug, health, projects, providers

api_router = APIRouter()
api_router.include_router(debug.router)
api_router.include_router(health.router)
api_router.include_router(providers.router)
api_router.include_router(projects.router)
