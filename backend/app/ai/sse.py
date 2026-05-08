from __future__ import annotations

from collections.abc import AsyncIterator
import json

from app.models.ai_actions import AiActionStreamEvent


def format_sse_event(event: AiActionStreamEvent) -> bytes:
    payload = json.dumps(event.payload, ensure_ascii=False)
    return f"event: {event.event}\ndata: {payload}\n\n".encode("utf-8")


async def stream_sse_events(events: AsyncIterator[AiActionStreamEvent]) -> AsyncIterator[bytes]:
    async for event in events:
        yield format_sse_event(event)
