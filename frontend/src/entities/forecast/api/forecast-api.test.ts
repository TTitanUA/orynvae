import { afterEach, describe, expect, it, vi } from "vitest";

import { forecastQueryKeys } from "../model/forecast-query-keys";
import { fetchForecast, fetchForecasts, generateForecast, selectForecastOption } from "./forecast-api";

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

describe("forecast API", () => {
  it("keeps stable query keys", () => {
    expect(forecastQueryKeys.list("project-1")).toEqual(["forecasts", "list", "project-1"]);
    expect(forecastQueryKeys.detail("project-1", "forecast-1")).toEqual([
      "forecasts",
      "detail",
      "project-1",
      "forecast-1",
    ]);
  });

  it("calls forecast endpoints", async () => {
    const fetchMock = vi.fn(() => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchForecasts("project-1");
    await fetchForecast("project-1", "forecast-1");
    await generateForecast("project-1", {
      source_chapter_id: "chapter-1",
      horizon_chapters: 2,
      active_story_line_ids: ["line-1"],
    });
    await selectForecastOption("project-1", "forecast-1", "option-1");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/projects/project-1/forecasts", {
      headers: { "Content-Type": "application/json" },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/projects/project-1/forecasts/forecast-1", {
      headers: { "Content-Type": "application/json" },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/projects/project-1/forecast",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          source_chapter_id: "chapter-1",
          horizon_chapters: 2,
          active_story_line_ids: ["line-1"],
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/projects/project-1/forecasts/forecast-1/options/option-1/select",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
