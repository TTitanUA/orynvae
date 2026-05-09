import { afterEach, describe, expect, it, vi } from "vitest";

import { chapterReviewQueryKeys } from "../model/chapter-review-query-keys";
import { applyChapterReview, fetchChapterReview, generateChapterReview } from "./chapter-review-api";

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

describe("chapter review API", () => {
  it("keeps stable query keys", () => {
    expect(chapterReviewQueryKeys.detail("project-1", "chapter-1")).toEqual([
      "chapter-reviews",
      "detail",
      "project-1",
      "chapter-1",
    ]);
  });

  it("calls review endpoints", async () => {
    const fetchMock = vi.fn(() => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchChapterReview("project-1", "chapter-1");
    await generateChapterReview("project-1", "chapter-1", { source_draft_version_id: "draft-1" });
    await applyChapterReview("project-1", "chapter-1", {
      review_id: "review-1",
      memory_decisions: [{ proposal_id: "proposal-1", status: "accepted", target_status: "canon" }],
      story_line_decisions: [{ update_id: "line-update-1", status: "accepted", target_story_line_id: "line-1" }],
      note_decisions: [{ note_id: "note-1", status: "resolved", decision_note: "Handled." }],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/projects/project-1/chapters/chapter-1/review",
      { headers: { "Content-Type": "application/json" } },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/projects/project-1/chapters/chapter-1/review",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ source_draft_version_id: "draft-1" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/projects/project-1/chapters/chapter-1/review/apply",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          review_id: "review-1",
          memory_decisions: [{ proposal_id: "proposal-1", status: "accepted", target_status: "canon" }],
          story_line_decisions: [{ update_id: "line-update-1", status: "accepted", target_story_line_id: "line-1" }],
          note_decisions: [{ note_id: "note-1", status: "resolved", decision_note: "Handled." }],
        }),
      }),
    );
  });
});
