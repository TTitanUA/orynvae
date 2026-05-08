from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.ai.registry import list_action_definitions
from app.ai.service import AiActionException, execute_action, stream_action_events
from app.ai.sse import stream_sse_events
from app.models.ai_actions import AiActionDefinitionResponse, AiActionRequest, AiActionResult

router = APIRouter(prefix="/ai-actions", tags=["ai-actions"])


@router.get("/definitions", response_model=list[AiActionDefinitionResponse])
def action_definitions() -> list[AiActionDefinitionResponse]:
    return list_action_definitions()


@router.post("/execute", response_model=AiActionResult)
async def execute_ai_action(payload: AiActionRequest) -> AiActionResult:
    try:
        return await execute_action(payload)
    except AiActionException as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.to_detail()) from exc


@router.post("/stream")
async def stream_ai_action(payload: AiActionRequest) -> StreamingResponse:
    return StreamingResponse(
        stream_sse_events(stream_action_events(payload)),
        media_type="text/event-stream",
    )
