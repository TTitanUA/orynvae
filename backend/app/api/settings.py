from fastapi import APIRouter

from app.models.settings import PrivacySettingsRecord
from app.services import settings_store

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/privacy", response_model=PrivacySettingsRecord)
def get_privacy_settings() -> PrivacySettingsRecord:
    return settings_store.get_privacy_settings()


@router.put("/privacy", response_model=PrivacySettingsRecord)
def update_privacy_settings(payload: PrivacySettingsRecord) -> PrivacySettingsRecord:
    return settings_store.update_privacy_settings(payload)
