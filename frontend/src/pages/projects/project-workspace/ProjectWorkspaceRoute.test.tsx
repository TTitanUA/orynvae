// @vitest-environment jsdom

import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../../shared/testing";
import { ProjectWorkspaceRoute } from "./ProjectWorkspaceRoute";

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

describe("ProjectWorkspaceRoute", () => {
  it("renders read-only workspace memory state from v2 endpoints", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/workspace-summary")) {
        return jsonResponse({
          project: {
            id: "project-1",
            title: "Memory Courier",
            synopsis: "A courier finds a future memory.",
            status: "active",
            active_provider_id: null,
            active_model_id: null,
            expansion_policy: "ask",
            created_at: "2026-05-08T10:00:00",
            updated_at: "2026-05-08T10:00:00",
            archived_at: null,
          },
          runtime: {
            read_only: true,
            ai_available: false,
            reason: "AI provider is not configured",
            active_provider: null,
            active_model: null,
          },
          next_step: {
            code: "configure_ai",
            label: "Настроить AI",
            detail: "Творческие действия заблокированы.",
            href: "/settings/providers",
          },
          memory_counts: {
            total: 1,
            proposed: 1,
            draft: 0,
            canon: 0,
            rejected: 0,
            outdated: 0,
            pending_proposals: 0,
          },
          pending_memory_items: [],
          pending_proposals: [],
          active_story_lines: [],
          planned_chapter: null,
          latest_chapter: null,
          warnings: ["AI provider is not configured"],
        });
      }
      if (url.includes("/memory-proposals")) {
        return jsonResponse([]);
      }
      if (url.includes("/memory")) {
        return jsonResponse([
          {
            id: "memory-1",
            project_id: "project-1",
            type: "character",
            title: "Courier",
            summary: "Carries forbidden memories.",
            body: null,
            status: "proposed",
            source_type: "start_story",
            source_id: null,
            importance: 2,
            created_at: "2026-05-08T10:00:00",
            updated_at: "2026-05-08T10:00:00",
          },
        ]);
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <MemoryRouter>
        <ProjectWorkspaceRoute projectId="project-1" />
      </MemoryRouter>,
    );

    expect((await screen.findByText("Memory Courier")).textContent).toBe("Memory Courier");
    expect((await screen.findByText("Только чтение")).textContent).toBe("Только чтение");
    expect((await screen.findByText("Courier")).textContent).toBe("Courier");
    expect((await screen.findAllByText("AI-предложение")).length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project-1/workspace-summary",
      expect.any(Object),
    );
  });
});
