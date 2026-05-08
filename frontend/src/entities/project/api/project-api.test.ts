import { describe, expect, it } from "vitest";

import { projectStatusLabel, type Project } from "..";

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
