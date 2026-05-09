from fastapi import APIRouter

from app.api import (
    ai_actions,
    chapters,
    debug,
    health,
    memory,
    projects,
    providers,
    runtime,
    sessions,
    settings,
    story_lines,
)

api_router = APIRouter()
api_router.include_router(ai_actions.router)
api_router.include_router(chapters.router)
api_router.include_router(debug.router)
api_router.include_router(health.router)
api_router.include_router(memory.router)
api_router.include_router(providers.router)
api_router.include_router(sessions.router)
api_router.include_router(story_lines.router)
api_router.include_router(projects.router)
api_router.include_router(runtime.router)
api_router.include_router(settings.router)
