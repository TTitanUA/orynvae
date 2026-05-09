import { mutationOptions } from "@tanstack/react-query";

import {
  completeNarratorSession,
  pauseNarratorSession,
  regenerateLastNarratorTurn,
  regenerateNarratorSuggestedActions,
  rollbackNarratorSession,
  startNarratorSession,
  submitNarratorTurn,
  updateNarratorAgentSettings,
  updateNarratorKeyEvent,
  updateNarratorTurnFlags,
} from "../api/narrator-session-api";
import type {
  NarratorAgentSettingsPayload,
  NarratorKeyEventUpdatePayload,
  NarratorRegeneratePayload,
  NarratorRollbackPayload,
  NarratorSuggestedActionsRegeneratePayload,
  NarratorTurnFlagPayload,
  NarratorTurnPayload,
} from "./types";

export const narratorSessionMutations = {
  start: (sessionId: string) =>
    mutationOptions({
      mutationKey: ["narrator-sessions", sessionId, "start"] as const,
      mutationFn: () => startNarratorSession(sessionId),
    }),
  submitTurn: (sessionId: string) =>
    mutationOptions({
      mutationKey: ["narrator-sessions", sessionId, "turns", "submit"] as const,
      mutationFn: (payload: NarratorTurnPayload) => submitNarratorTurn(sessionId, payload),
    }),
  updateAgentSettings: (sessionId: string) =>
    mutationOptions({
      mutationKey: ["narrator-sessions", sessionId, "agent-settings"] as const,
      mutationFn: (payload: NarratorAgentSettingsPayload) =>
        updateNarratorAgentSettings(sessionId, payload),
    }),
  regenerateLast: (sessionId: string) =>
    mutationOptions({
      mutationKey: ["narrator-sessions", sessionId, "turns", "regenerate-last"] as const,
      mutationFn: (payload: NarratorRegeneratePayload) =>
        regenerateLastNarratorTurn(sessionId, payload),
    }),
  regenerateSuggestedActions: (sessionId: string) =>
    mutationOptions({
      mutationKey: ["narrator-sessions", sessionId, "suggested-actions", "regenerate"] as const,
      mutationFn: (payload: NarratorSuggestedActionsRegeneratePayload) =>
        regenerateNarratorSuggestedActions(sessionId, payload),
    }),
  rollback: (sessionId: string) =>
    mutationOptions({
      mutationKey: ["narrator-sessions", sessionId, "rollback"] as const,
      mutationFn: (payload: NarratorRollbackPayload) =>
        rollbackNarratorSession(sessionId, payload),
    }),
  pause: (sessionId: string) =>
    mutationOptions({
      mutationKey: ["narrator-sessions", sessionId, "pause"] as const,
      mutationFn: () => pauseNarratorSession(sessionId),
    }),
  complete: (sessionId: string) =>
    mutationOptions({
      mutationKey: ["narrator-sessions", sessionId, "complete"] as const,
      mutationFn: () => completeNarratorSession(sessionId),
    }),
  updateTurnFlags: (sessionId: string, turnId: string) =>
    mutationOptions({
      mutationKey: ["narrator-sessions", sessionId, "turns", turnId, "flags"] as const,
      mutationFn: (payload: NarratorTurnFlagPayload) =>
        updateNarratorTurnFlags(sessionId, turnId, payload),
    }),
  updateKeyEvent: (sessionId: string, eventId: string) =>
    mutationOptions({
      mutationKey: ["narrator-sessions", sessionId, "key-events", eventId, "update"] as const,
      mutationFn: (payload: NarratorKeyEventUpdatePayload) =>
        updateNarratorKeyEvent(sessionId, eventId, payload),
    }),
};
