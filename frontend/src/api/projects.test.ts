import { afterEach, describe, expect, it, vi } from "vitest";

import { continuitySeverityLabel, projectStatusLabel, requestChapterAi } from "./projects";
import type { Project } from "../types/projects";

afterEach(() => {
  vi.unstubAllGlobals();
});

function project(overrides: Partial<Project>): Project {
  return {
    id: "project-1",
    name: "Test",
    description: null,
    synopsis: null,
    provider_id: null,
    model_id: null,
    status: "active",
    created_at: "2026-05-02T00:00:00",
    updated_at: "2026-05-02T00:00:00",
    archived_at: null,
    is_hidden: false,
    settings: null,
    ...overrides,
  };
}

describe("projectStatusLabel", () => {
  it("marks active projects", () => {
    expect(projectStatusLabel(project({}))).toBe("Активен");
  });

  it("marks archived projects", () => {
    expect(projectStatusLabel(project({ archived_at: "2026-05-02T01:00:00" }))).toBe("Архив");
  });
});

describe("continuitySeverityLabel", () => {
  it("labels review severities", () => {
    expect(continuitySeverityLabel("conflict")).toBe("Conflict");
    expect(continuitySeverityLabel("warning")).toBe("Warning");
    expect(continuitySeverityLabel("info")).toBe("Info");
  });
});

describe("requestChapterAi", () => {
  it("streams chunks to the caller and returns the full text", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("draft "));
        controller.enqueue(encoder.encode("help"));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const chunks: string[] = [];

    const text = await requestChapterAi(
      "project-1",
      {
        action: "continue",
        chapter_id: "chapter-1",
        draft_text: "Existing draft",
        stream: true,
      },
      (chunk) => chunks.push(chunk),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project-1/chapter-editor/assist",
      expect.objectContaining({ method: "POST" }),
    );
    expect(chunks).toEqual(["draft ", "help"]);
    expect(text).toBe("draft help");
  });
});
