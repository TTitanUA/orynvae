// @vitest-environment jsdom

import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../../shared/testing";
import { StoryLinesRoute } from "./StoryLinesRoute";

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

describe("StoryLinesRoute", () => {
  it("renders story lines in read-only mode", async () => {
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
            detail: null,
            href: "/settings/providers",
          },
          memory_counts: {
            total: 0,
            proposed: 0,
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
          warnings: [],
        });
      }
      if (url.includes("/story-lines")) {
        return jsonResponse([
          {
            id: "line-1",
            project_id: "project-1",
            type: "mystery",
            title: "Death memory source",
            description: "Who sent it?",
            current_state: "No one knows yet.",
            status: "active",
            priority: 2,
            last_progress_chapter_id: null,
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
        <StoryLinesRoute projectId="project-1" />
      </MemoryRouter>,
    );

    expect((await screen.findByText("Линии истории")).textContent).toBe("Линии истории");
    expect((await screen.findByText("Только чтение")).textContent).toBe("Только чтение");
    expect((await screen.findByText("Death memory source")).textContent).toBe("Death memory source");
    expect(screen.getByPlaceholderText("Название линии")).toHaveProperty("disabled", true);
  });
});
