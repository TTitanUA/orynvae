from collections.abc import AsyncIterator

from fastapi import APIRouter, HTTPException, Response, status
from fastapi.responses import StreamingResponse

from app.models.providers import (
    ProviderChatRequest,
    ProviderCreate,
    ProviderDefaults,
    ProviderModelPreferencesUpdate,
    ProviderModelRefreshResponse,
    ProviderRecord,
    ProviderTestRequest,
    ProviderTestResponse,
    ProviderUpdate,
    ProviderWithModels,
)
from app.providers.adapters import PROVIDER_DEFINITIONS, create_adapter
from app.services import provider_store

router = APIRouter(prefix="/providers", tags=["providers"])


@router.get("/defaults", response_model=list[ProviderDefaults])
def provider_defaults() -> list[ProviderDefaults]:
    return [
        ProviderDefaults(
            type=definition.type,
            label=definition.label,
            base_url=definition.base_url,
            models_path=definition.models_path,
            chat_path=definition.chat_path,
            is_local=definition.is_local,
            is_external=definition.is_external,
            requires_api_key=definition.requires_api_key,
            supports_model_listing=definition.supports_model_listing,
        )
        for definition in PROVIDER_DEFINITIONS.values()
    ]


@router.get("", response_model=list[ProviderWithModels])
def list_providers() -> list[ProviderWithModels]:
    providers = provider_store.list_providers()
    return [
        ProviderWithModels(**provider.model_dump(), models=provider_store.list_models(provider.id))
        for provider in providers
    ]


@router.post("", response_model=ProviderRecord, status_code=status.HTTP_201_CREATED)
def create_provider(payload: ProviderCreate) -> ProviderRecord:
    return provider_store.create_provider(payload)


@router.patch("/{provider_id}", response_model=ProviderRecord)
def update_provider(provider_id: str, payload: ProviderUpdate) -> ProviderRecord:
    try:
        provider = provider_store.update_provider(provider_id, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    if provider is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")
    return provider


@router.delete("/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_provider(provider_id: str) -> Response:
    deleted = provider_store.delete_provider(provider_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{provider_id}/models/refresh", response_model=ProviderModelRefreshResponse)
async def refresh_models(provider_id: str) -> ProviderModelRefreshResponse:
    stored = provider_store.get_provider(provider_id)
    if stored is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")
    if not stored.provider.is_enabled:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Provider is disabled")

    adapter = create_adapter(stored.provider, stored.api_key)
    result = await adapter.test_connection()
    provider_store.update_provider_check(provider_id, result.error)
    if not result.ok:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=result.message)

    models = provider_store.upsert_models(provider_id, result.models)
    return ProviderModelRefreshResponse(
        provider_id=provider_id,
        models=models,
        message=f"Обновлено моделей: {len(models)}",
    )


@router.post("/{provider_id}/test", response_model=ProviderTestResponse)
async def test_provider(
    provider_id: str,
    payload: ProviderTestRequest | None = None,
) -> ProviderTestResponse:
    stored = provider_store.get_provider(provider_id)
    if stored is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")
    if not stored.provider.is_enabled:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Provider is disabled")

    adapter = create_adapter(stored.provider, stored.api_key)
    request = payload or ProviderTestRequest()
    result = await adapter.test_connection(model_id=request.model_id, prompt=request.prompt)
    provider_store.update_provider_check(provider_id, result.error)
    models = provider_store.upsert_models(provider_id, result.models) if result.models else []
    return ProviderTestResponse(
        ok=result.ok,
        message=result.message,
        latency_ms=result.latency_ms,
        models=models,
        sample=result.sample,
    )


@router.post("/{provider_id}/default-model", response_model=ProviderRecord)
def set_default_model(provider_id: str, payload: dict[str, str | None]) -> ProviderRecord:
    try:
        provider = provider_store.set_default_model(provider_id, payload.get("model_id"))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    if provider is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")
    return provider


@router.patch("/{provider_id}/models/preferences", response_model=ProviderWithModels)
def update_model_preferences(
    provider_id: str,
    payload: ProviderModelPreferencesUpdate,
) -> ProviderWithModels:
    try:
        provider = provider_store.update_model_preferences(provider_id, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    if provider is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")
    return provider


@router.post("/{provider_id}/default-provider", response_model=ProviderRecord)
def set_default_provider(provider_id: str) -> ProviderRecord:
    provider = provider_store.set_default_provider(provider_id)
    if provider is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")
    return provider


@router.post("/{provider_id}/chat")
async def chat(provider_id: str, payload: ProviderChatRequest) -> Response:
    stored = provider_store.get_provider(provider_id)
    if stored is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")
    if not stored.provider.is_enabled:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Provider is disabled")
    model = provider_store.get_model(provider_id, payload.model_id)
    if model is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Model does not belong to this provider",
        )
    if not model.is_allowed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Model is not allowed for this provider",
        )

    adapter = create_adapter(stored.provider, stored.api_key)
    if payload.stream and stored.provider.streaming_enabled:
        return StreamingResponse(
            _stream_chunks(adapter.stream_chat(
                model_id=payload.model_id,
                messages=payload.messages,
                temperature=payload.temperature,
                routing_config=model.routing_config,
            )),
            media_type="text/plain; charset=utf-8",
        )

    text = await adapter.complete_chat(
        model_id=payload.model_id,
        messages=payload.messages,
        temperature=payload.temperature,
        routing_config=model.routing_config,
    )
    return Response(content=text, media_type="text/plain; charset=utf-8")


async def _stream_chunks(chunks: AsyncIterator[str]) -> AsyncIterator[bytes]:
    async for chunk in chunks:
        yield chunk.encode("utf-8")
