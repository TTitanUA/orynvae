from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.ai.service import AiActionException
from app.models.narrator_sessions import (
    NarratorAgentSettingsRequest,
    NarratorKeyEventUpdateRequest,
    NarratorRegenerateRequest,
    NarratorRollbackRequest,
    NarratorSuggestedActionsRegenerateRequest,
    NarratorSuggestedActionsResponse,
    NarratorSessionDetail,
    NarratorSessionLogResponse,
    NarratorTurnFlagUpdateRequest,
    NarratorTurnRequest,
    NarratorTurnResponse,
)
from app.models.story_runtime import KeyEventRecord, SessionTurnRecord
from app.services import narrator_sessions
from app.services import story_runtime_store

router = APIRouter(prefix="/sessions/{session_id}", tags=["sessions"])


@router.get("", response_model=NarratorSessionDetail)
def get_session(session_id: str) -> NarratorSessionDetail:
    detail = narrator_sessions.get_session_detail(session_id)
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return detail


@router.post("/start", response_model=NarratorSessionDetail)
def start_session(session_id: str) -> NarratorSessionDetail:
    try:
        detail = narrator_sessions.start_session(session_id)
    except narrator_sessions.NarratorSessionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return detail


@router.patch("/agent-settings", response_model=NarratorSessionDetail)
def update_agent_settings(
    session_id: str,
    payload: NarratorAgentSettingsRequest,
) -> NarratorSessionDetail:
    try:
        detail = narrator_sessions.update_agent_settings(session_id, payload)
    except narrator_sessions.NarratorSessionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return detail


@router.post("/turns", response_model=NarratorTurnResponse)
async def submit_turn(session_id: str, payload: NarratorTurnRequest) -> NarratorTurnResponse:
    try:
        result = await narrator_sessions.submit_turn(session_id, payload)
    except narrator_sessions.NarratorSessionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    except AiActionException as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.to_detail()) from exc
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return result


@router.post("/turns/regenerate-last", response_model=NarratorSessionDetail)
async def regenerate_last_narration(
    session_id: str,
    payload: NarratorRegenerateRequest,
) -> NarratorSessionDetail:
    try:
        detail = await narrator_sessions.regenerate_last_narration(session_id, payload)
    except narrator_sessions.NarratorSessionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    except AiActionException as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.to_detail()) from exc
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return detail


@router.post("/suggested-actions/regenerate", response_model=NarratorSuggestedActionsResponse)
async def regenerate_suggested_actions(
    session_id: str,
    payload: NarratorSuggestedActionsRegenerateRequest,
) -> NarratorSuggestedActionsResponse:
    try:
        result = await narrator_sessions.regenerate_suggested_actions(session_id, payload)
    except narrator_sessions.NarratorSessionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    except AiActionException as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.to_detail()) from exc
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return result


@router.post("/rollback", response_model=NarratorSessionDetail)
async def rollback_session(
    session_id: str,
    payload: NarratorRollbackRequest,
) -> NarratorSessionDetail:
    try:
        detail = await narrator_sessions.rollback_session(session_id, payload)
    except narrator_sessions.NarratorSessionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    except AiActionException as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.to_detail()) from exc
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Turn not found")
    return detail


@router.get("/turns", response_model=list[SessionTurnRecord])
def list_turns(session_id: str) -> list[SessionTurnRecord]:
    detail = narrator_sessions.get_session_detail(session_id)
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return detail.turns


@router.get("/log", response_model=NarratorSessionLogResponse)
def get_log(session_id: str) -> NarratorSessionLogResponse:
    log = narrator_sessions.get_session_log(session_id)
    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return log


@router.patch("/turns/{turn_id}", response_model=SessionTurnRecord)
def update_turn_flags(
    session_id: str,
    turn_id: str,
    payload: NarratorTurnFlagUpdateRequest,
) -> SessionTurnRecord:
    try:
        turn = narrator_sessions.update_turn_flags(session_id, turn_id, payload)
    except narrator_sessions.NarratorSessionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    if turn is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Turn not found")
    return turn


@router.post("/pause", response_model=NarratorSessionDetail)
def pause_session(session_id: str) -> NarratorSessionDetail:
    try:
        detail = narrator_sessions.pause_session(session_id)
    except narrator_sessions.NarratorSessionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return detail


@router.post("/complete", response_model=NarratorSessionDetail)
def complete_session(session_id: str) -> NarratorSessionDetail:
    try:
        detail = narrator_sessions.complete_session(session_id)
    except narrator_sessions.NarratorSessionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return detail


@router.get("/key-events", response_model=list[KeyEventRecord])
def list_key_events(session_id: str) -> list[KeyEventRecord]:
    detail = narrator_sessions.get_session_detail(session_id)
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return story_runtime_store.list_key_events(detail.session.id)


@router.patch("/key-events/{event_id}", response_model=KeyEventRecord)
def update_key_event(
    session_id: str,
    event_id: str,
    payload: NarratorKeyEventUpdateRequest,
) -> KeyEventRecord:
    try:
        event = narrator_sessions.update_key_event(session_id, event_id, payload)
    except narrator_sessions.NarratorSessionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Key event not found")
    return event
