import { describe, expect, it } from "vitest";

import { projectStatusLabel } from "./projects";
import type { Project } from "../types/projects";

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

