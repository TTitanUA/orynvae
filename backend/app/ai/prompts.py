from __future__ import annotations

import json

from pydantic import BaseModel

from app.ai.registry import AiActionDefinition
from app.models.ai_actions import AiActionRequest
from app.models.providers import ChatMessage

SYSTEM_RULES = """You are an Orynvae v2 AI action executor.
Orynvae is AI-first: do not propose manual creative fallback workflows.
The user keeps authorship: offer candidates, options and explanations, not a single forced truth.
Artistic prose must be markdown only. Do not output HTML, rich text JSON or editor state.
Confirmed canon must not be changed silently. Propose changes as candidates.
Return only data that is supported by the provided input and context."""


def build_action_messages(
    request: AiActionRequest,
    definition: AiActionDefinition,
) -> list[ChatMessage]:
    user_payload = {
        "action_type": request.action_type,
        "privacy_level": request.privacy_level,
        "input": request.input,
        "context": request.context.model_dump(mode="json"),
    }
    if definition.structured:
        return [
            ChatMessage(role="system", content=SYSTEM_RULES),
            ChatMessage(
                role="system",
                content=(
                    "Return exactly one JSON object matching this JSON Schema. "
                    "Do not wrap it in markdown. Do not add commentary.\n"
                    f"{_schema_text(definition.output_model)}"
                ),
            ),
            ChatMessage(role="user", content=json.dumps(user_payload, ensure_ascii=False)),
        ]
    return [
        ChatMessage(role="system", content=SYSTEM_RULES),
        ChatMessage(role="user", content=json.dumps(user_payload, ensure_ascii=False)),
    ]


def build_repair_messages(
    request: AiActionRequest,
    definition: AiActionDefinition,
    *,
    invalid_output: str,
    validation_error: str,
) -> list[ChatMessage]:
    repair_payload = {
        "action_type": request.action_type,
        "validation_error": validation_error,
        "invalid_output": invalid_output,
    }
    return [
        ChatMessage(role="system", content=SYSTEM_RULES),
        ChatMessage(
            role="system",
            content=(
                "Repair the invalid AI output. Return exactly one JSON object matching this "
                "JSON Schema. Do not invent missing story facts. Do not add commentary.\n"
                f"{_schema_text(definition.output_model)}"
            ),
        ),
        ChatMessage(role="user", content=json.dumps(repair_payload, ensure_ascii=False)),
    ]


def _schema_text(output_model: type[BaseModel]) -> str:
    return json.dumps(output_model.model_json_schema(), ensure_ascii=False)
