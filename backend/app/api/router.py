from fastapi import APIRouter

from app.api import characters, debug, health, projects, providers, settings

api_router = APIRouter()
api_router.include_router(debug.router)
api_router.include_router(health.router)
api_router.include_router(providers.router)
api_router.include_router(characters.router)
api_router.include_router(projects.router)
api_router.include_router(settings.router)
