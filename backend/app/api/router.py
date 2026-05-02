from fastapi import APIRouter

from app.api import health, providers

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(providers.router)
