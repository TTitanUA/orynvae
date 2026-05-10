// @vitest-environment jsdom

import { cleanup, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../../shared/testing";
import { ChaptersRoute } from "./ChaptersRoute";

afterEach(() => {
  cleanup();
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

describe("ChaptersRoute", () => {
  it("renders saved chapters with links to readable drafts", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/workspace-summary")) {
        return jsonResponse({
          project: {
            id: "project-1",
            title: "Memory Courier",
            synopsis: "A courier finds a future memory.",
            status: "active",
            active_provider_id: "provider-1",
            active_model_id: "model-1",
            expansion_policy: "ask",
            is_hidden: false,
            created_at: "2026-05-08T10:00:00",
            updated_at: "2026-05-08T10:00:00",
            archived_at: null,
          },
          runtime: {
            read_only: false,
            ai_available: true,
            reason: null,
            active_provider: null,
            active_model: null,
          },
          next_step: {
            code: "continue_story",
            label: "Продолжить историю",
            detail: null,
            href: "/projects/project-1/chapters/prepare",
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
          active_session: null,
          warnings: [],
        });
      }
      if (url.endsWith("/api/projects/project-1/chapters")) {
        return jsonResponse([
          {
            id: "chapter-2",
            project_id: "project-1",
            title: "Second Memory",
            order_index: 2,
            status: "planned",
            synopsis: "A chapter that is not ready yet.",
            draft_markdown: "",
            final_markdown: "",
            session_id: null,
            created_at: "2026-05-08T12:00:00",
            updated_at: "2026-05-08T12:00:00",
          },
          {
            id: "chapter-1",
            project_id: "project-1",
            title: "First Memory",
            order_index: 1,
            status: "draft_generated",
            synopsis: "The first chapter synopsis.",
            draft_markdown: "The finished draft text.",
            final_markdown: "",
            session_id: "session-1",
            created_at: "2026-05-08T11:00:00",
            updated_at: "2026-05-08T11:30:00",
          },
        ]);
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <MemoryRouter>
        <ChaptersRoute projectId="project-1" />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Главы" })).toBeTruthy();
    expect(await screen.findByText("Memory Courier")).toBeTruthy();
    expect(await screen.findByText("First Memory")).toBeTruthy();
    expect(await screen.findByText("The finished draft text.")).toBeTruthy();
    expect((await screen.findByRole("link", { name: /Читать черновик/ })).getAttribute("href")).toBe(
      "/projects/project-1/sessions/session-1/draft",
    );
    expect((await screen.findByRole("link", { name: "Подготовить главу" })).getAttribute("href")).toBe(
      "/projects/project-1/chapters/prepare",
    );
  });
});
