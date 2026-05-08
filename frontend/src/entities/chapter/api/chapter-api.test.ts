import { afterEach, describe, expect, it, vi } from "vitest";

import { chapterQueryKeys } from "../model/chapter-query-keys";
import { createChapter, fetchChapter, fetchChapters, prepareChapterSession } from "./chapter-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chapter API", () => {
  it("keeps stable query keys", () => {
    expect(chapterQueryKeys.list("project-1")).toEqual(["chapters", "list", "project-1"]);
    expect(chapterQueryKeys.detail("project-1", "chapter-1")).toEqual([
      "chapters",
      "detail",
      "project-1",
      "chapter-1",
    ]);
  });

  it("calls chapter list, detail, create and prepare endpoints", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchChapters("project-1");
    await fetchChapter("project-1", "chapter-1");
    await createChapter("project-1", { title: "First", synopsis: "Start" });
    await prepareChapterSession("project-1", "chapter-1", {
      user_role: "author",
      controlled_character_ids: [],
      secondary_story_line_ids: [],
      provider_id: "provider-1",
      model_id: "model-1",
      temperature: 0.45,
      top_p: 0.8,
      reasoning_effort: "medium",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/projects/project-1/chapters",
      { headers: { "Content-Type": "application/json" } },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/projects/project-1/chapters/chapter-1",
      { headers: { "Content-Type": "application/json" } },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/projects/project-1/chapters",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ title: "First", synopsis: "Start" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/projects/project-1/chapters/chapter-1/session/prepare",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          user_role: "author",
          controlled_character_ids: [],
          secondary_story_line_ids: [],
          provider_id: "provider-1",
          model_id: "model-1",
          temperature: 0.45,
          top_p: 0.8,
          reasoning_effort: "medium",
        }),
      }),
    );
  });
});
