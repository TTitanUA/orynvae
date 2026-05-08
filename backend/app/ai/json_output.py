from __future__ import annotations

import json
import re

from pydantic import BaseModel, ValidationError


class StructuredOutputError(ValueError):
    def __init__(self, message: str, *, details: dict[str, object] | None = None) -> None:
        super().__init__(message)
        self.details = details or {}


def extract_json_object(text: str) -> dict[str, object]:
    stripped = text.strip()
    if not stripped:
        raise StructuredOutputError("AI response is empty")

    parsed = _try_parse_object(stripped)
    if parsed is not None:
        return parsed

    for match in re.finditer(r"```(?:json)?\s*(.*?)```", stripped, flags=re.IGNORECASE | re.DOTALL):
        parsed = _try_parse_object(match.group(1).strip())
        if parsed is not None:
            return parsed

    decoder = json.JSONDecoder()
    for index, char in enumerate(stripped):
        if char != "{":
            continue
        try:
            value, _ = decoder.raw_decode(stripped[index:])
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            return value

    raise StructuredOutputError("AI response does not contain a JSON object")


def validate_json_output(text: str, output_model: type[BaseModel]) -> tuple[BaseModel, dict[str, object]]:
    payload = extract_json_object(text)
    try:
        return output_model.model_validate(payload), payload
    except ValidationError as exc:
        raise StructuredOutputError(
            "AI response does not match the required schema",
            details={"errors": exc.errors(include_url=False)},
        ) from exc


def _try_parse_object(value: str) -> dict[str, object] | None:
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None
