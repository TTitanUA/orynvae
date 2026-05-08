import { afterEach, describe, expect, it, vi } from "vitest";

import {
  analyzeStartStory,
  confirmStartStory,
  projectStatusLabel,
  refineStartStory,
  type Project,
} from "..";

afterEach(() => {
  vi.unstubAllGlobals();
});

function project(overrides: Partial<Project>): Project {
  return {
    id: "project-1",
    title: "Test",
    synopsis: "",
    status: "active",
    active_provider_id: null,
    active_model_id: null,
    expansion_policy: "ask",
    created_at: "2026-05-02T00:00:00",
    updated_at: "2026-05-02T00:00:00",
    archived_at: null,
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

describe("start story API", () => {
  it("posts synopsis analysis to the v2 start endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          source_synopsis: "Idea",
          title: null,
          tone: null,
          avoid: null,
          preferred_user_role: null,
          provider_id: "provider-1",
          model_id: "model-1",
          provider_name: "Local",
          provider_is_external: false,
          understood_synopsis: "Understood",
          emotional_core: null,
          suggested_title: "Title",
          questions: [],
          warnings: [],
          memory_items: [],
          story_lines: [],
          start_points: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await analyzeStartStory({ synopsis: "Idea" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/start/analyze",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ synopsis: "Idea" }),
      }),
    );
  });

  it("posts confirmation to the v2 start endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          project: project({ id: "project-2", title: "Title" }),
          created_memory_items: [],
          created_story_lines: [],
          initial_chapter: null,
          start_points: [],
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await confirmStartStory({
      source_synopsis: "Idea",
      project_title: "Title",
      expansion_policy: "ask",
      memory_items: [],
      story_lines: [],
      selected_start_point: null,
      skip_start_point: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/start/confirm",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("posts refinement feedback to the v2 start endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          source_synopsis: "Idea",
          title: null,
          tone: null,
          avoid: null,
          preferred_user_role: null,
          provider_id: "provider-1",
          model_id: "model-1",
          provider_name: "Local",
          provider_is_external: false,
          understood_synopsis: "Updated",
          emotional_core: null,
          suggested_title: "Title",
          questions: [],
          warnings: [],
          memory_items: [],
          story_lines: [],
          start_points: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await refineStartStory({
      source_synopsis: "Idea",
      feedback: "Make it warmer",
      current_questions: [],
      current_memory_items: [],
      current_story_lines: [],
      current_start_points: [],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/start/refine",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          source_synopsis: "Idea",
          feedback: "Make it warmer",
          current_questions: [],
          current_memory_items: [],
          current_story_lines: [],
          current_start_points: [],
        }),
      }),
    );
  });
});
