from fastapi import APIRouter

from app.api import ai_actions, debug, health, projects, providers, runtime, settings

api_router = APIRouter()
api_router.include_router(ai_actions.router)
api_router.include_router(debug.router)
api_router.include_router(health.router)
api_router.include_router(providers.router)
api_router.include_router(projects.router)
api_router.include_router(runtime.router)
api_router.include_router(settings.router)
