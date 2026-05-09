import { afterEach, describe, expect, it, vi } from "vitest";

import { draftQueryKeys } from "../model/draft-query-keys";
import { assembleDraft, assistDraft, fetchDraftVersions, updateDraft } from "./draft-api";

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

describe("draft API", () => {
  it("keeps stable query keys", () => {
    expect(draftQueryKeys.versions("project-1", "chapter-1")).toEqual([
      "drafts",
      "versions",
      "project-1",
      "chapter-1",
    ]);
  });

  it("calls stage 7 draft endpoints", async () => {
    const fetchMock = vi.fn(() => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchDraftVersions("project-1", "chapter-1");
    await assembleDraft("session-1", {
      mode: "literary",
      required_event_ids: ["event-1"],
      excluded_turn_ids: ["turn-2"],
      style_notes: "Keep it tense.",
    });
    await updateDraft("project-1", "chapter-1", { markdown: "# Draft", status: "edited", mode: "literary" });
    await assistDraft("project-1", "chapter-1", {
      selection_markdown: "old",
      instructions: "rewrite",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/projects/project-1/chapters/chapter-1/draft-versions",
      { headers: { "Content-Type": "application/json" } },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/sessions/session-1/assemble-draft",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          mode: "literary",
          required_event_ids: ["event-1"],
          excluded_turn_ids: ["turn-2"],
          style_notes: "Keep it tense.",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/projects/project-1/chapters/chapter-1/draft",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ markdown: "# Draft", status: "edited", mode: "literary" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/projects/project-1/chapters/chapter-1/draft/assist",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ selection_markdown: "old", instructions: "rewrite" }),
      }),
    );
  });
});
