from pydantic import BaseModel


class PrivacySettingsRecord(BaseModel):
    show_hidden_items: bool = False
