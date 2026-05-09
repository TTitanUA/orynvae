import { requestJson } from "../../../shared/api";
import type {
  KeyEvent,
  NarratorAgentSettingsPayload,
  NarratorKeyEventUpdatePayload,
  NarratorRegeneratePayload,
  NarratorRollbackPayload,
  NarratorSuggestedActionsRegeneratePayload,
  NarratorSuggestedActionsResponse,
  NarratorSessionDetail,
  NarratorSessionLog,
  NarratorTurnFlagPayload,
  NarratorTurnPayload,
  NarratorTurnResponse,
} from "../model/types";
import type { SessionTurn } from "../../chapter";

export async function fetchNarratorSession(sessionId: string): Promise<NarratorSessionDetail> {
  return requestJson<NarratorSessionDetail>(`/api/sessions/${sessionId}`);
}

export async function startNarratorSession(sessionId: string): Promise<NarratorSessionDetail> {
  return requestJson<NarratorSessionDetail>(`/api/sessions/${sessionId}/start`, {
    method: "POST",
  });
}

export async function submitNarratorTurn(
  sessionId: string,
  payload: NarratorTurnPayload,
): Promise<NarratorTurnResponse> {
  return requestJson<NarratorTurnResponse>(`/api/sessions/${sessionId}/turns`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateNarratorAgentSettings(
  sessionId: string,
  payload: NarratorAgentSettingsPayload,
): Promise<NarratorSessionDetail> {
  return requestJson<NarratorSessionDetail>(`/api/sessions/${sessionId}/agent-settings`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function regenerateLastNarratorTurn(
  sessionId: string,
  payload: NarratorRegeneratePayload,
): Promise<NarratorSessionDetail> {
  return requestJson<NarratorSessionDetail>(`/api/sessions/${sessionId}/turns/regenerate-last`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function regenerateNarratorSuggestedActions(
  sessionId: string,
  payload: NarratorSuggestedActionsRegeneratePayload,
): Promise<NarratorSuggestedActionsResponse> {
  return requestJson<NarratorSuggestedActionsResponse>(
    `/api/sessions/${sessionId}/suggested-actions/regenerate`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function rollbackNarratorSession(
  sessionId: string,
  payload: NarratorRollbackPayload,
): Promise<NarratorSessionDetail> {
  return requestJson<NarratorSessionDetail>(`/api/sessions/${sessionId}/rollback`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchNarratorTurns(sessionId: string): Promise<SessionTurn[]> {
  return requestJson<SessionTurn[]>(`/api/sessions/${sessionId}/turns`);
}

export async function fetchNarratorLog(sessionId: string): Promise<NarratorSessionLog> {
  return requestJson<NarratorSessionLog>(`/api/sessions/${sessionId}/log`);
}

export async function updateNarratorTurnFlags(
  sessionId: string,
  turnId: string,
  payload: NarratorTurnFlagPayload,
): Promise<SessionTurn> {
  return requestJson<SessionTurn>(`/api/sessions/${sessionId}/turns/${turnId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function pauseNarratorSession(sessionId: string): Promise<NarratorSessionDetail> {
  return requestJson<NarratorSessionDetail>(`/api/sessions/${sessionId}/pause`, {
    method: "POST",
  });
}

export async function completeNarratorSession(sessionId: string): Promise<NarratorSessionDetail> {
  return requestJson<NarratorSessionDetail>(`/api/sessions/${sessionId}/complete`, {
    method: "POST",
  });
}

export async function fetchNarratorKeyEvents(sessionId: string): Promise<KeyEvent[]> {
  return requestJson<KeyEvent[]>(`/api/sessions/${sessionId}/key-events`);
}

export async function updateNarratorKeyEvent(
  sessionId: string,
  eventId: string,
  payload: NarratorKeyEventUpdatePayload,
): Promise<KeyEvent> {
  return requestJson<KeyEvent>(`/api/sessions/${sessionId}/key-events/${eventId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
