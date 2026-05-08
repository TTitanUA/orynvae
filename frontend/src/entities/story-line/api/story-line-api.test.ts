import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchStoryLine,
  fetchStoryLineProgress,
  fetchStoryLines,
  suggestStoryLines,
  updateStoryLineStatus,
} from "./story-line-api";
import { storyLineQueryKeys } from "../model/story-line-query-keys";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("story line API", () => {
  it("keeps stable query keys", () => {
    expect(storyLineQueryKeys.list("project-1", { status: "active" })).toEqual([
      "story-lines",
      "list",
      "project-1",
      { status: "active" },
    ]);
    expect(storyLineQueryKeys.detail("project-1", "line-1")).toEqual([
      "story-lines",
      "detail",
      "project-1",
      "line-1",
    ]);
    expect(storyLineQueryKeys.progress("project-1", "line-1")).toEqual([
      "story-lines",
      "progress",
      "project-1",
      "line-1",
    ]);
  });

  it("adds filters to list requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchStoryLines("project-1", {
      type: "mystery",
      status: "proposed",
      search: " Archive ",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project-1/story-lines?type=mystery&status=proposed&search=Archive",
      { headers: { "Content-Type": "application/json" } },
    );
  });

  it("calls progress, status and suggest endpoints", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchStoryLine("project-1", "line-1");
    await fetchStoryLineProgress("project-1", "line-1");
    await updateStoryLineStatus("project-1", "line-1", "active");
    await suggestStoryLines("project-1", {
      instructions: "more threat",
      max_suggestions: 2,
      provider_id: "provider-1",
      model_id: "story-model",
      temperature: 0.4,
      top_p: 0.8,
      reasoning_effort: "medium",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/projects/project-1/story-lines/line-1",
      { headers: { "Content-Type": "application/json" } },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/projects/project-1/story-lines/line-1/progress",
      { headers: { "Content-Type": "application/json" } },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/projects/project-1/story-lines/line-1/status",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ status: "active" }) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/projects/project-1/story-lines/suggest",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          instructions: "more threat",
          max_suggestions: 2,
          provider_id: "provider-1",
          model_id: "story-model",
          temperature: 0.4,
          top_p: 0.8,
          reasoning_effort: "medium",
        }),
      }),
    );
  });
});
