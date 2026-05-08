// @vitest-environment jsdom

import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../../shared/testing";
import { ChapterPrepareRoute } from "./ChapterPrepareRoute";

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

describe("ChapterPrepareRoute", () => {
  it("renders chapter preparation in read-only mode", async () => {
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
          planned_chapter: {
            id: "chapter-1",
            project_id: "project-1",
            title: "First delivery",
            order_index: 1,
            status: "planned",
            synopsis: "Start at the archive.",
            draft_markdown: "",
            final_markdown: "",
            session_id: null,
            created_at: "2026-05-08T10:00:00",
            updated_at: "2026-05-08T10:00:00",
          },
          latest_chapter: null,
          warnings: [],
        });
      }
      if (url.includes("/chapters")) {
        return jsonResponse([
          {
            id: "chapter-1",
            project_id: "project-1",
            title: "First delivery",
            order_index: 1,
            status: "planned",
            synopsis: "Start at the archive.",
            draft_markdown: "",
            final_markdown: "",
            session_id: null,
            created_at: "2026-05-08T10:00:00",
            updated_at: "2026-05-08T10:00:00",
          },
        ]);
      }
      if (url.includes("/memory")) {
        return jsonResponse([
          {
            id: "memory-1",
            project_id: "project-1",
            type: "character",
            title: "Courier",
            summary: null,
            body: null,
            status: "canon",
            source_type: null,
            source_id: null,
            importance: 1,
            created_at: "2026-05-08T10:00:00",
            updated_at: "2026-05-08T10:00:00",
          },
        ]);
      }
      if (url.includes("/story-lines")) {
        return jsonResponse([
          {
            id: "line-1",
            project_id: "project-1",
            type: "mystery",
            title: "Death memory source",
            description: null,
            current_state: null,
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
        <ChapterPrepareRoute chapterId="chapter-1" projectId="project-1" />
      </MemoryRouter>,
    );

    expect((await screen.findByText("Подготовка главы")).textContent).toBe("Подготовка главы");
    expect((await screen.findByText("Только чтение")).textContent).toBe("Только чтение");
    expect((await screen.findByText("Courier")).textContent).toBe("Courier");
    expect(screen.getByRole("button", { name: /Подготовить с AI/ })).toHaveProperty(
      "disabled",
      true,
    );
  });
});
