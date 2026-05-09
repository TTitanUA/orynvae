import { afterEach, describe, expect, it, vi } from "vitest";

import {
  completeNarratorSession,
  fetchNarratorLog,
  fetchNarratorSession,
  pauseNarratorSession,
  regenerateLastNarratorTurn,
  regenerateNarratorSuggestedActions,
  rollbackNarratorSession,
  startNarratorSession,
  submitNarratorTurn,
  updateNarratorAgentSettings,
  updateNarratorKeyEvent,
  updateNarratorTurnFlags,
} from "./narrator-session-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("narrator session api", () => {
  it("uses the session endpoints", async () => {
    const fetchMock = vi.fn(() => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchNarratorSession("session-1");
    await startNarratorSession("session-1");
    await submitNarratorTurn("session-1", {
      input_type: "action",
      content: "Open the door.",
      selected_option_id: null,
    });
    await updateNarratorAgentSettings("session-1", {
      agent_instructions: "Stay concise.",
      agent_temperature: 0.3,
    });
    await regenerateLastNarratorTurn("session-1", { comment: "Less direct." });
    await regenerateNarratorSuggestedActions("session-1", {
      source_turn_id: "turn-ai",
      prompt: "More cautious options.",
    });
    await rollbackNarratorSession("session-1", {
      target_turn_id: "turn-1",
      user_turn_mode: "keep",
      comment: "Try again.",
    });
    await fetchNarratorLog("session-1");
    await updateNarratorTurnFlags("session-1", "turn-1", { exclude_from_draft: true });
    await pauseNarratorSession("session-1");
    await completeNarratorSession("session-1");
    await updateNarratorKeyEvent("session-1", "event-1", { include_in_draft: false });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/sessions/session-1", {
      headers: { "Content-Type": "application/json" },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/sessions/session-1/start", {
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/sessions/session-1/turns",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          input_type: "action",
          content: "Open the door.",
          selected_option_id: null,
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/sessions/session-1/agent-settings",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          agent_instructions: "Stay concise.",
          agent_temperature: 0.3,
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/sessions/session-1/turns/regenerate-last",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ comment: "Less direct." }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      "/api/sessions/session-1/suggested-actions/regenerate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          source_turn_id: "turn-ai",
          prompt: "More cautious options.",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      "/api/sessions/session-1/rollback",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          target_turn_id: "turn-1",
          user_turn_mode: "keep",
          comment: "Try again.",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(8, "/api/sessions/session-1/log", {
      headers: { "Content-Type": "application/json" },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      9,
      "/api/sessions/session-1/turns/turn-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ exclude_from_draft: true }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(10, "/api/sessions/session-1/pause", {
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(11, "/api/sessions/session-1/complete", {
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      12,
      "/api/sessions/session-1/key-events/event-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ include_in_draft: false }),
      }),
    );
  });
});
