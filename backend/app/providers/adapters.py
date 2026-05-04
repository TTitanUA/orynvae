from collections.abc import AsyncIterator
from dataclasses import dataclass
import json
import time
from typing import Any

import httpx

from app.core.debug_logging import debug_log
from app.models.providers import ChatMessage, ProviderRecord, ProviderType


@dataclass(frozen=True)
class ProviderDefinition:
    type: ProviderType
    label: str
    base_url: str
    models_path: str
    chat_path: str
    is_local: bool
    requires_api_key: bool
    supports_model_listing: bool = True

    @property
    def is_external(self) -> bool:
        return not self.is_local


@dataclass(frozen=True)
class ProviderModel:
    model_id: str
    display_name: str
    supports_streaming: bool = True
    context_window: int | None = None
    capabilities: dict[str, object] | None = None


@dataclass(frozen=True)
class ProviderTestResult:
    ok: bool
    message: str
    latency_ms: int
    models: list[ProviderModel]
    sample: str | None = None
    error: str | None = None


def _string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str) and item.strip()]


def _string_value(value: object) -> str | None:
    return value if isinstance(value, str) and value.strip() else None


PROVIDER_DEFINITIONS: dict[ProviderType, ProviderDefinition] = {
    "lmstudio": ProviderDefinition(
        type="lmstudio",
        label="LM Studio",
        base_url="http://localhost:1234/v1",
        models_path="/models",
        chat_path="/chat/completions",
        is_local=True,
        requires_api_key=False,
    ),
    "ollama": ProviderDefinition(
        type="ollama",
        label="Ollama",
        base_url="http://localhost:11434",
        models_path="/api/tags",
        chat_path="/api/chat",
        is_local=True,
        requires_api_key=False,
    ),
    "openai": ProviderDefinition(
        type="openai",
        label="OpenAI",
        base_url="https://api.openai.com/v1",
        models_path="/models",
        chat_path="/chat/completions",
        is_local=False,
        requires_api_key=True,
    ),
    "openrouter": ProviderDefinition(
        type="openrouter",
        label="OpenRouter",
        base_url="https://openrouter.ai/api/v1",
        models_path="/models",
        chat_path="/chat/completions",
        is_local=False,
        requires_api_key=True,
    ),
    "custom_openai": ProviderDefinition(
        type="custom_openai",
        label="Custom OpenAI-compatible",
        base_url="http://localhost:8000/v1",
        models_path="/models",
        chat_path="/chat/completions",
        is_local=False,
        requires_api_key=False,
    ),
}


def _join_url(base_url: str, path: str | None) -> str:
    if not path:
        return base_url.rstrip("/")
    return f"{base_url.rstrip('/')}/{path.lstrip('/')}"


def _duration_ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)


def _exception_payload(exc: Exception) -> dict[str, object]:
    payload: dict[str, object] = {
        "error_type": exc.__class__.__name__,
        "error": str(exc),
    }
    if isinstance(exc, httpx.HTTPStatusError):
        payload["status_code"] = exc.response.status_code
        payload["response_text"] = exc.response.text
    return payload


def _status_code(response: object) -> int | None:
    status_code = getattr(response, "status_code", None)
    return status_code if isinstance(status_code, int) else None


class ProviderAdapter:
    def __init__(self, provider: ProviderRecord, api_key: str | None) -> None:
        self.provider = provider
        self.api_key = api_key

    def _log_llm(self, operation: str, payload: dict[str, Any] | None = None) -> None:
        debug_log(
            "backend",
            "LLM",
            operation,
            {
                "provider_id": self.provider.id,
                "provider_type": self.provider.type,
                "provider_name": self.provider.name,
                **(payload or {}),
            },
        )

    async def list_models(self) -> list[ProviderModel]:
        raise NotImplementedError

    async def complete_chat(
        self,
        *,
        model_id: str,
        messages: list[ChatMessage],
        temperature: float,
        routing_config: dict[str, object] | None = None,
    ) -> str:
        raise NotImplementedError

    async def stream_chat(
        self,
        *,
        model_id: str,
        messages: list[ChatMessage],
        temperature: float,
        routing_config: dict[str, object] | None = None,
    ) -> AsyncIterator[str]:
        text = await self.complete_chat(
            model_id=model_id,
            messages=messages,
            temperature=temperature,
            routing_config=routing_config,
        )
        yield text

    async def test_connection(
        self,
        *,
        model_id: str | None = None,
        prompt: str | None = None,
    ) -> ProviderTestResult:
        started = time.perf_counter()
        self._log_llm(
            "provider.test.start",
            {"model_id": model_id, "has_prompt": bool(prompt)},
        )
        try:
            models = await self.list_models()
            sample = None
            if prompt and model_id:
                sample = await self.complete_chat(
                    model_id=model_id,
                    messages=[ChatMessage(role="user", content=prompt)],
                    temperature=0.2,
                )
            latency_ms = int((time.perf_counter() - started) * 1000)
            self._log_llm(
                "provider.test.end",
                {
                    "ok": True,
                    "latency_ms": latency_ms,
                    "model_count": len(models),
                    "sample_length": len(sample) if sample else 0,
                },
            )
            return ProviderTestResult(
                ok=True,
                message="Подключение работает",
                latency_ms=latency_ms,
                models=models,
                sample=sample,
            )
        except httpx.HTTPStatusError as exc:
            latency_ms = int((time.perf_counter() - started) * 1000)
            message = f"Provider returned HTTP {exc.response.status_code}"
            self._log_llm(
                "provider.test.error",
                {"latency_ms": latency_ms, **_exception_payload(exc)},
            )
            return ProviderTestResult(
                ok=False,
                message=message,
                latency_ms=latency_ms,
                models=[],
                error=message,
            )
        except httpx.HTTPError as exc:
            latency_ms = int((time.perf_counter() - started) * 1000)
            message = str(exc) or exc.__class__.__name__
            self._log_llm(
                "provider.test.error",
                {"latency_ms": latency_ms, **_exception_payload(exc)},
            )
            return ProviderTestResult(
                ok=False,
                message=message,
                latency_ms=latency_ms,
                models=[],
                error=message,
            )


class OpenAICompatibleAdapter(ProviderAdapter):
    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        if self.provider.type == "openrouter":
            headers["HTTP-Referer"] = "http://localhost:9002"
            headers["X-Title"] = "Orynvae"
        return headers

    def _chat_payload(
        self,
        *,
        model_id: str,
        messages: list[ChatMessage],
        temperature: float,
        stream: bool,
        routing_config: dict[str, object] | None = None,
    ) -> dict[str, object]:
        payload: dict[str, object] = {
            "model": model_id,
            "messages": [message.model_dump() for message in messages],
            "temperature": temperature,
            "stream": stream,
        }
        if self.provider.type == "openrouter" and routing_config:
            payload["provider"] = routing_config
        return payload

    async def list_models(self) -> list[ProviderModel]:
        url = _join_url(self.provider.base_url, self.provider.models_path)
        headers = self._headers()
        started = time.perf_counter()
        self._log_llm("models.request", {"method": "GET", "url": url, "headers": headers})
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(url, headers=headers)
                response.raise_for_status()
                payload = response.json()
        except Exception as exc:
            self._log_llm(
                "models.error",
                {"method": "GET", "url": url, "duration_ms": _duration_ms(started), **_exception_payload(exc)},
            )
            raise

        raw_models = payload.get("data", []) if isinstance(payload, dict) else []
        models: list[ProviderModel] = []
        for raw_model in raw_models:
            if not isinstance(raw_model, dict):
                continue
            model_id = raw_model.get("id")
            if not isinstance(model_id, str) or not model_id:
                continue
            display_name = raw_model.get("name") if isinstance(raw_model.get("name"), str) else model_id
            context_window = raw_model.get("context_length") or raw_model.get("context_window")
            architecture = raw_model.get("architecture")
            architecture = architecture if isinstance(architecture, dict) else {}
            capabilities: dict[str, object] = {
                "owned_by": raw_model.get("owned_by"),
                "source": self.provider.type,
            }
            if isinstance(context_window, int):
                capabilities["context_length"] = context_window
            if input_modalities := _string_list(architecture.get("input_modalities")):
                capabilities["input_modalities"] = input_modalities
            if output_modalities := _string_list(architecture.get("output_modalities")):
                capabilities["output_modalities"] = output_modalities
            if modality := _string_value(architecture.get("modality")):
                capabilities["modality"] = modality
            if instruct_type := _string_value(architecture.get("instruct_type")):
                capabilities["instruct_type"] = instruct_type
            if tokenizer := _string_value(architecture.get("tokenizer")):
                capabilities["tokenizer"] = tokenizer
            if supported_parameters := _string_list(raw_model.get("supported_parameters")):
                capabilities["supported_parameters"] = supported_parameters
            models.append(
                ProviderModel(
                    model_id=model_id,
                    display_name=display_name,
                    context_window=context_window if isinstance(context_window, int) else None,
                    capabilities=capabilities,
                )
            )
        self._log_llm(
            "models.response",
            {
                "method": "GET",
                "url": url,
                "status_code": _status_code(response),
                "duration_ms": _duration_ms(started),
                "model_count": len(models),
                "response": payload,
            },
        )
        return models

    async def complete_chat(
        self,
        *,
        model_id: str,
        messages: list[ChatMessage],
        temperature: float,
        routing_config: dict[str, object] | None = None,
    ) -> str:
        url = _join_url(self.provider.base_url, self.provider.chat_path)
        payload = self._chat_payload(
            model_id=model_id,
            messages=messages,
            temperature=temperature,
            stream=False,
            routing_config=routing_config,
        )
        headers = self._headers()
        started = time.perf_counter()
        self._log_llm(
            "chat.request",
            {
                "method": "POST",
                "url": url,
                "model_id": model_id,
                "stream": False,
                "headers": headers,
                "request": payload,
            },
        )
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                body = response.json()
        except Exception as exc:
            self._log_llm(
                "chat.error",
                {
                    "method": "POST",
                    "url": url,
                    "model_id": model_id,
                    "stream": False,
                    "duration_ms": _duration_ms(started),
                    **_exception_payload(exc),
                },
            )
            raise

        choices = body.get("choices", []) if isinstance(body, dict) else []
        text = ""
        if not choices:
            text = ""
        else:
            first = choices[0]
            if isinstance(first, dict):
                message = first.get("message")
                if isinstance(message, dict) and isinstance(message.get("content"), str):
                    text = message["content"]
                elif isinstance(first.get("text"), str):
                    text = first["text"]
        self._log_llm(
            "chat.response",
            {
                "method": "POST",
                "url": url,
                "model_id": model_id,
                "stream": False,
                "status_code": _status_code(response),
                "duration_ms": _duration_ms(started),
                "response": body,
                "text_length": len(text),
            },
        )
        return text

    async def stream_chat(
        self,
        *,
        model_id: str,
        messages: list[ChatMessage],
        temperature: float,
        routing_config: dict[str, object] | None = None,
    ) -> AsyncIterator[str]:
        url = _join_url(self.provider.base_url, self.provider.chat_path)
        payload = self._chat_payload(
            model_id=model_id,
            messages=messages,
            temperature=temperature,
            stream=True,
            routing_config=routing_config,
        )
        headers = self._headers()
        started = time.perf_counter()
        chunk_count = 0
        total_chars = 0
        self._log_llm(
            "chat.stream.request",
            {
                "method": "POST",
                "url": url,
                "model_id": model_id,
                "stream": True,
                "headers": headers,
                "request": payload,
            },
        )
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("POST", url, headers=headers, json=payload) as response:
                    response.raise_for_status()
                    self._log_llm(
                        "chat.stream.response",
                        {
                            "method": "POST",
                            "url": url,
                            "model_id": model_id,
                            "status_code": _status_code(response),
                            "duration_ms": _duration_ms(started),
                        },
                    )
                    async for line in response.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data = line.removeprefix("data: ").strip()
                        if data == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data)
                        except json.JSONDecodeError as exc:
                            self._log_llm(
                                "chat.stream.decode_error",
                                {"line": line, **_exception_payload(exc)},
                            )
                            continue
                        for choice in chunk.get("choices", []):
                            if not isinstance(choice, dict):
                                continue
                            delta = choice.get("delta")
                            if isinstance(delta, dict) and isinstance(delta.get("content"), str):
                                content = delta["content"]
                                chunk_count += 1
                                total_chars += len(content)
                                self._log_llm(
                                    "chat.stream.chunk",
                                    {
                                        "model_id": model_id,
                                        "chunk_index": chunk_count,
                                        "chunk": content,
                                    },
                                )
                                yield content
            self._log_llm(
                "chat.stream.end",
                {
                    "method": "POST",
                    "url": url,
                    "model_id": model_id,
                    "duration_ms": _duration_ms(started),
                    "chunk_count": chunk_count,
                    "total_chars": total_chars,
                },
            )
        except Exception as exc:
            self._log_llm(
                "chat.stream.error",
                {
                    "method": "POST",
                    "url": url,
                    "model_id": model_id,
                    "duration_ms": _duration_ms(started),
                    **_exception_payload(exc),
                },
            )
            raise


class OllamaAdapter(ProviderAdapter):
    async def list_models(self) -> list[ProviderModel]:
        url = _join_url(self.provider.base_url, self.provider.models_path)
        started = time.perf_counter()
        self._log_llm("models.request", {"method": "GET", "url": url})
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(url)
                response.raise_for_status()
                payload = response.json()
        except Exception as exc:
            self._log_llm(
                "models.error",
                {"method": "GET", "url": url, "duration_ms": _duration_ms(started), **_exception_payload(exc)},
            )
            raise

        raw_models = payload.get("models", []) if isinstance(payload, dict) else []
        models: list[ProviderModel] = []
        for raw_model in raw_models:
            if not isinstance(raw_model, dict):
                continue
            model_id = raw_model.get("name")
            if not isinstance(model_id, str) or not model_id:
                continue
            models.append(
                ProviderModel(
                    model_id=model_id,
                    display_name=model_id,
                    capabilities={
                        "modified_at": raw_model.get("modified_at"),
                        "size": raw_model.get("size"),
                        "source": "ollama",
                    },
                )
            )
        self._log_llm(
            "models.response",
            {
                "method": "GET",
                "url": url,
                "status_code": _status_code(response),
                "duration_ms": _duration_ms(started),
                "model_count": len(models),
                "response": payload,
            },
        )
        return models

    async def complete_chat(
        self,
        *,
        model_id: str,
        messages: list[ChatMessage],
        temperature: float,
        routing_config: dict[str, object] | None = None,
    ) -> str:
        url = _join_url(self.provider.base_url, self.provider.chat_path)
        payload = {
            "model": model_id,
            "messages": [message.model_dump() for message in messages],
            "options": {"temperature": temperature},
            "stream": False,
        }
        started = time.perf_counter()
        self._log_llm(
            "chat.request",
            {
                "method": "POST",
                "url": url,
                "model_id": model_id,
                "stream": False,
                "request": payload,
            },
        )
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                body = response.json()
        except Exception as exc:
            self._log_llm(
                "chat.error",
                {
                    "method": "POST",
                    "url": url,
                    "model_id": model_id,
                    "stream": False,
                    "duration_ms": _duration_ms(started),
                    **_exception_payload(exc),
                },
            )
            raise
        message = body.get("message") if isinstance(body, dict) else None
        text = ""
        if isinstance(message, dict) and isinstance(message.get("content"), str):
            text = message["content"]
        elif isinstance(body, dict) and isinstance(body.get("response"), str):
            text = body["response"]
        self._log_llm(
            "chat.response",
            {
                "method": "POST",
                "url": url,
                "model_id": model_id,
                "stream": False,
                "status_code": _status_code(response),
                "duration_ms": _duration_ms(started),
                "response": body,
                "text_length": len(text),
            },
        )
        return text

    async def stream_chat(
        self,
        *,
        model_id: str,
        messages: list[ChatMessage],
        temperature: float,
        routing_config: dict[str, object] | None = None,
    ) -> AsyncIterator[str]:
        url = _join_url(self.provider.base_url, self.provider.chat_path)
        payload = {
            "model": model_id,
            "messages": [message.model_dump() for message in messages],
            "options": {"temperature": temperature},
            "stream": True,
        }
        started = time.perf_counter()
        chunk_count = 0
        total_chars = 0
        self._log_llm(
            "chat.stream.request",
            {
                "method": "POST",
                "url": url,
                "model_id": model_id,
                "stream": True,
                "request": payload,
            },
        )
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("POST", url, json=payload) as response:
                    response.raise_for_status()
                    self._log_llm(
                        "chat.stream.response",
                        {
                            "method": "POST",
                            "url": url,
                            "model_id": model_id,
                            "status_code": _status_code(response),
                            "duration_ms": _duration_ms(started),
                        },
                    )
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        try:
                            chunk = json.loads(line)
                        except json.JSONDecodeError as exc:
                            self._log_llm(
                                "chat.stream.decode_error",
                                {"line": line, **_exception_payload(exc)},
                            )
                            continue
                        message = chunk.get("message")
                        if isinstance(message, dict) and isinstance(message.get("content"), str):
                            content = message["content"]
                            chunk_count += 1
                            total_chars += len(content)
                            self._log_llm(
                                "chat.stream.chunk",
                                {
                                    "model_id": model_id,
                                    "chunk_index": chunk_count,
                                    "chunk": content,
                                },
                            )
                            yield content
                        if chunk.get("done"):
                            break
            self._log_llm(
                "chat.stream.end",
                {
                    "method": "POST",
                    "url": url,
                    "model_id": model_id,
                    "duration_ms": _duration_ms(started),
                    "chunk_count": chunk_count,
                    "total_chars": total_chars,
                },
            )
        except Exception as exc:
            self._log_llm(
                "chat.stream.error",
                {
                    "method": "POST",
                    "url": url,
                    "model_id": model_id,
                    "duration_ms": _duration_ms(started),
                    **_exception_payload(exc),
                },
            )
            raise


def create_adapter(provider: ProviderRecord, api_key: str | None) -> ProviderAdapter:
    if provider.type == "ollama":
        return OllamaAdapter(provider, api_key)
    return OpenAICompatibleAdapter(provider, api_key)
