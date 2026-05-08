from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from http import HTTPStatus
from typing import Any

from pydantic import BaseModel

from app.ai.json_output import StructuredOutputError, validate_json_output
from app.ai.prompts import build_action_messages, build_repair_messages
from app.ai.registry import AiActionDefinition, get_action_definition
from app.core.debug_logging import debug_log
from app.models.ai_actions import (
    AiActionProviderReference,
    AiActionRequest,
    AiActionResult,
    AiActionStreamEvent,
    AiActionWarning,
)
from app.models.providers import ProviderModelRecord, ProviderRecord
from app.providers.adapters import create_adapter
from app.services import project_store, provider_store
from app.services.provider_store import StoredProvider
from app.services.runtime_status import READ_ONLY_ERROR_CODE, get_runtime_status


class AiActionException(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        status_code: int = HTTPStatus.BAD_GATEWAY,
        details: dict[str, object] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}

    def to_detail(self) -> dict[str, object]:
        return {
            "code": self.code,
            "message": self.message,
            "details": self.details,
        }


@dataclass(frozen=True)
class ResolvedActionProvider:
    stored: StoredProvider
    model: ProviderModelRecord

    @property
    def provider(self) -> ProviderRecord:
        return self.stored.provider

    def to_reference(self) -> AiActionProviderReference:
        return AiActionProviderReference(
            provider_id=self.provider.id,
            model_id=self.model.model_id,
            provider_name=self.provider.name,
            provider_type=self.provider.type,
            is_external=self.provider.is_external,
        )


async def execute_action(request: AiActionRequest) -> AiActionResult:
    definition = get_action_definition(request.action_type)
    resolved = resolve_action_provider(request)
    adapter = create_adapter(resolved.provider, resolved.stored.api_key)
    messages = build_action_messages(request, definition)
    repair_performed = False

    _log_action(
        "action.start",
        request,
        resolved,
        {"streaming": False, "structured": definition.structured},
    )
    try:
        _log_action("action.provider.request", request, resolved)
        raw_text = await adapter.complete_chat(
            model_id=resolved.model.model_id,
            messages=messages,
            temperature=request.temperature,
            top_p=request.top_p,
            reasoning_effort=request.reasoning_effort,
            routing_config=resolved.model.routing_config,
        )
        _log_action(
            "action.provider.response",
            request,
            resolved,
            {"response_length": len(raw_text)},
        )
        provider_store.update_provider_check(resolved.provider.id, None)
    except Exception as exc:
        _handle_provider_error(request, resolved, exc)

    structured_model: BaseModel | None = None
    if definition.structured:
        structured_model, repair_performed = await _validate_or_repair(
            request,
            definition,
            resolved,
            raw_text,
        )

    result = _build_result(
        request,
        definition,
        resolved,
        raw_text,
        structured_model=structured_model,
        repair_performed=repair_performed,
    )
    _log_action("action.done", request, resolved, {"repair_performed": repair_performed})
    return result


async def stream_action_events(request: AiActionRequest) -> AsyncIterator[AiActionStreamEvent]:
    definition = get_action_definition(request.action_type)
    try:
        resolved = resolve_action_provider(request)
    except AiActionException as exc:
        yield _error_event(exc)
        return

    adapter = create_adapter(resolved.provider, resolved.stored.api_key)
    use_provider_stream = (
        request.streaming
        and definition.supports_streaming
        and resolved.provider.streaming_enabled
        and resolved.model.supports_streaming
    )
    _log_action(
        "action.start",
        request,
        resolved,
        {"streaming": True, "provider_stream": use_provider_stream},
    )
    yield AiActionStreamEvent(
        event="start",
        payload={
            "action_type": request.action_type,
            "provider": resolved.to_reference().model_dump(mode="json"),
            "streaming": use_provider_stream,
        },
    )

    raw_chunks: list[str] = []
    try:
        if use_provider_stream:
            _log_action("action.provider.request", request, resolved, {"streaming": True})
            async for chunk in adapter.stream_chat(
                model_id=resolved.model.model_id,
                messages=build_action_messages(request, definition),
                temperature=request.temperature,
                top_p=request.top_p,
                reasoning_effort=request.reasoning_effort,
                routing_config=resolved.model.routing_config,
            ):
                raw_chunks.append(chunk)
                yield AiActionStreamEvent(event="delta", payload={"text": chunk})
        else:
            _log_action("action.provider.request", request, resolved, {"streaming": False})
            text = await adapter.complete_chat(
                model_id=resolved.model.model_id,
                messages=build_action_messages(request, definition),
                temperature=request.temperature,
                top_p=request.top_p,
                reasoning_effort=request.reasoning_effort,
                routing_config=resolved.model.routing_config,
            )
            raw_chunks.append(text)
            yield AiActionStreamEvent(event="delta", payload={"text": text})
        _log_action(
            "action.provider.response",
            request,
            resolved,
            {"response_length": len("".join(raw_chunks)), "streaming": use_provider_stream},
        )
        provider_store.update_provider_check(resolved.provider.id, None)
    except Exception as exc:
        yield _error_event(_provider_exception(request, resolved, exc))
        return

    raw_text = "".join(raw_chunks)
    repair_performed = False
    structured_model: BaseModel | None = None
    if definition.structured:
        try:
            structured_model, repair_performed = await _validate_or_repair(
                request,
                definition,
                resolved,
                raw_text,
            )
        except AiActionException as exc:
            yield _error_event(exc)
            return
        if repair_performed:
            yield AiActionStreamEvent(
                event="warning",
                payload={
                    "code": "AI_STRUCTURED_OUTPUT_REPAIRED",
                    "message": "Initial structured output was repaired by an AI request.",
                },
            )
        yield AiActionStreamEvent(
            event="structured_delta",
            payload={"structured_json": structured_model.model_dump(mode="json")},
        )

    result = _build_result(
        request,
        definition,
        resolved,
        raw_text,
        structured_model=structured_model,
        repair_performed=repair_performed,
    )
    _log_action("action.done", request, resolved, {"repair_performed": repair_performed})
    yield AiActionStreamEvent(event="done", payload={"result": result.model_dump(mode="json")})


def resolve_action_provider(request: AiActionRequest) -> ResolvedActionProvider:
    if request.project_id is not None and project_store.get_project(request.project_id) is None:
        raise AiActionException(
            "PROJECT_NOT_FOUND",
            "Project not found",
            status_code=HTTPStatus.NOT_FOUND,
        )

    if request.provider_id:
        stored = provider_store.get_provider(request.provider_id)
        if stored is None:
            raise AiActionException(
                "AI_PROVIDER_NOT_FOUND",
                "AI provider not found",
                status_code=HTTPStatus.NOT_FOUND,
            )
        model_id = request.model_id or stored.provider.default_model_id
        return _resolve_model(stored, model_id)

    runtime = get_runtime_status(request.project_id)
    if not runtime.ai_available or runtime.active_provider is None or runtime.active_model is None:
        raise AiActionException(
            READ_ONLY_ERROR_CODE,
            runtime.reason or "AI provider is required for creative actions",
            status_code=HTTPStatus.CONFLICT,
        )
    stored = provider_store.get_provider(runtime.active_provider.id)
    if stored is None:
        raise AiActionException(
            "AI_PROVIDER_NOT_FOUND",
            "AI provider not found",
            status_code=HTTPStatus.NOT_FOUND,
        )
    return _resolve_model(stored, runtime.active_model.model_id)


def _resolve_model(
    stored: StoredProvider,
    model_id: str | None,
) -> ResolvedActionProvider:
    if not stored.provider.is_enabled:
        raise AiActionException(
            READ_ONLY_ERROR_CODE,
            "AI provider is disabled",
            status_code=HTTPStatus.CONFLICT,
        )
    if stored.provider.last_error:
        raise AiActionException(
            READ_ONLY_ERROR_CODE,
            stored.provider.last_error,
            status_code=HTTPStatus.CONFLICT,
        )
    if not model_id:
        raise AiActionException(
            READ_ONLY_ERROR_CODE,
            "AI model is not selected",
            status_code=HTTPStatus.CONFLICT,
        )
    model = provider_store.get_allowed_model(stored.provider.id, model_id)
    if model is None:
        known_model = provider_store.get_model(stored.provider.id, model_id)
        message = "Selected AI model is not allowed" if known_model else "Selected AI model is not known"
        raise AiActionException(
            READ_ONLY_ERROR_CODE,
            message,
            status_code=HTTPStatus.CONFLICT,
        )
    return ResolvedActionProvider(stored=stored, model=model)


async def _validate_or_repair(
    request: AiActionRequest,
    definition: AiActionDefinition,
    resolved: ResolvedActionProvider,
    raw_text: str,
) -> tuple[BaseModel, bool]:
    try:
        structured_model, _ = validate_json_output(raw_text, definition.output_model)
        return structured_model, False
    except StructuredOutputError as exc:
        _log_action(
            "action.validation.error",
            request,
            resolved,
            {"message": str(exc), "details": exc.details},
        )
        repair_text = await _repair_structured_output(request, definition, resolved, raw_text, exc)

    try:
        structured_model, _ = validate_json_output(repair_text, definition.output_model)
    except StructuredOutputError as exc:
        _log_action(
            "action.error",
            request,
            resolved,
            {"code": "AI_ACTION_VALIDATION_FAILED", "message": str(exc), "details": exc.details},
        )
        raise AiActionException(
            "AI_ACTION_VALIDATION_FAILED",
            "AI structured output did not match the required schema after repair",
            details={"validation_error": str(exc), **exc.details},
        ) from exc
    return structured_model, True


async def _repair_structured_output(
    request: AiActionRequest,
    definition: AiActionDefinition,
    resolved: ResolvedActionProvider,
    invalid_output: str,
    validation_error: StructuredOutputError,
) -> str:
    adapter = create_adapter(resolved.provider, resolved.stored.api_key)
    _log_action(
        "action.repair.start",
        request,
        resolved,
        {"validation_error": str(validation_error), "details": validation_error.details},
    )
    try:
        repair_text = await adapter.complete_chat(
            model_id=resolved.model.model_id,
            messages=build_repair_messages(
                request,
                definition,
                invalid_output=invalid_output,
                validation_error=str(validation_error),
            ),
            temperature=0,
            top_p=request.top_p,
            reasoning_effort=request.reasoning_effort,
            routing_config=resolved.model.routing_config,
        )
    except Exception as exc:
        _handle_provider_error(request, resolved, exc, operation="action.repair.error")
    _log_action("action.repair.end", request, resolved, {"response_length": len(repair_text)})
    return repair_text


def _build_result(
    request: AiActionRequest,
    definition: AiActionDefinition,
    resolved: ResolvedActionProvider,
    raw_text: str,
    *,
    structured_model: BaseModel | None,
    repair_performed: bool,
) -> AiActionResult:
    structured_json = structured_model.model_dump(mode="json") if structured_model else None
    return AiActionResult(
        action_type=request.action_type,
        provider=resolved.to_reference(),
        text=_result_text(raw_text, structured_json),
        structured_json=structured_json,
        suggestions=_list_from_structured(structured_json, "suggested_actions"),
        memory_candidates=(
            _list_from_structured(structured_json, "memory_items")
            or _list_from_structured(structured_json, "memory_proposal_candidates")
            or _list_from_structured(structured_json, "memory_proposals")
            or _list_from_structured(structured_json, "memory_updates")
        ),
        story_line_updates=(
            _list_from_structured(structured_json, "story_line_updates")
            or _list_from_structured(structured_json, "story_lines")
        ),
        warnings=[
            AiActionWarning(code="AI_ACTION_WARNING", message=warning)
            for warning in _warnings_from_structured(structured_json)
        ],
        repair_performed=repair_performed,
    )


def _result_text(raw_text: str, structured_json: dict[str, object] | None) -> str:
    if structured_json is None:
        return raw_text
    for key in (
        "markdown",
        "replacement_markdown",
        "narration_markdown",
        "narrator_opening",
        "summary",
        "understood_synopsis",
    ):
        value = structured_json.get(key)
        if isinstance(value, str):
            return value
    return raw_text


def _list_from_structured(
    structured_json: dict[str, object] | None,
    key: str,
) -> list[dict[str, object]]:
    if structured_json is None:
        return []
    value = structured_json.get(key)
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _warnings_from_structured(structured_json: dict[str, object] | None) -> list[str]:
    if structured_json is None:
        return []
    value = structured_json.get("warnings")
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]


def _provider_exception(
    request: AiActionRequest,
    resolved: ResolvedActionProvider,
    exc: Exception,
) -> AiActionException:
    message = str(exc) or exc.__class__.__name__
    provider_store.update_provider_check(resolved.provider.id, message)
    _log_action(
        "action.error",
        request,
        resolved,
        {
            "code": "AI_PROVIDER_ERROR",
            "error_type": exc.__class__.__name__,
            "message": message,
        },
    )
    return AiActionException(
        "AI_PROVIDER_ERROR",
        "AI provider request failed",
        details={"error_type": exc.__class__.__name__},
    )


def _handle_provider_error(
    request: AiActionRequest,
    resolved: ResolvedActionProvider,
    exc: Exception,
    *,
    operation: str = "action.error",
) -> Any:
    message = str(exc) or exc.__class__.__name__
    provider_store.update_provider_check(resolved.provider.id, message)
    _log_action(
        operation,
        request,
        resolved,
        {
            "code": "AI_PROVIDER_ERROR",
            "error_type": exc.__class__.__name__,
            "message": message,
        },
    )
    raise AiActionException(
        "AI_PROVIDER_ERROR",
        "AI provider request failed",
        details={"error_type": exc.__class__.__name__},
    ) from exc


def _error_event(exc: AiActionException) -> AiActionStreamEvent:
    return AiActionStreamEvent(event="error", payload=exc.to_detail())


def _log_action(
    operation: str,
    request: AiActionRequest,
    resolved: ResolvedActionProvider,
    payload: dict[str, object] | None = None,
) -> None:
    debug_log(
        "backend",
        "LLM",
        operation,
        {
            "action_type": request.action_type,
            "project_id": request.project_id,
            "provider_id": resolved.provider.id,
            "model_id": resolved.model.model_id,
            "privacy_level": request.privacy_level,
            **(payload or {}),
        },
    )
