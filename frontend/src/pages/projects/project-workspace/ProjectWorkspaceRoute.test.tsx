// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../../shared/testing";
import { ProjectWorkspaceRoute } from "./ProjectWorkspaceRoute";

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
            is_hidden: false,
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
      if (url.includes("/settings/privacy")) {
        return jsonResponse({ show_hidden_items: false });
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

  it("updates project hidden visibility from project settings", async () => {
    let projectIsHidden = false;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
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
            is_hidden: projectIsHidden,
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
            label: "Продолжить",
            detail: null,
            href: null,
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
      if (url.includes("/settings/privacy")) {
        return jsonResponse({ show_hidden_items: true });
      }
      if (url === "/api/projects/project-1" && init?.method === "PATCH") {
        projectIsHidden = true;
        return jsonResponse({
          id: "project-1",
          title: "Memory Courier",
          synopsis: "A courier finds a future memory.",
          status: "active",
          active_provider_id: "provider-1",
          active_model_id: "model-1",
          expansion_policy: "ask",
          is_hidden: true,
          created_at: "2026-05-08T10:00:00",
          updated_at: "2026-05-08T10:00:00",
          archived_at: null,
        });
      }
      if (url.includes("/memory-proposals") || url.includes("/memory")) {
        return jsonResponse([]);
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <MemoryRouter>
        <ProjectWorkspaceRoute projectId="project-1" />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("checkbox", { name: "Скрытый проект" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/project-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ is_hidden: true }),
        }),
      ),
    );
    expect(await screen.findByText("скрыт из обычных списков")).toBeTruthy();
  });

  it("links the next step to an active narrator session", async () => {
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
            code: "continue_session",
            label: "Открыть рассказчика",
            detail: "Есть сохраненная сессия.",
            href: "/projects/project-1/sessions/session-1/narrator",
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
          active_session: {
            id: "session-1",
            project_id: "project-1",
            chapter_id: "chapter-1",
            status: "active",
            user_role: "author",
            controlled_character_ids: [],
            active_story_line_ids: [],
            tone: null,
            pace: null,
            expansion_policy_override: null,
            agent_instructions: null,
            agent_temperature: 0.7,
            agent_top_p: null,
            agent_reasoning_effort: null,
            started_at: null,
            paused_at: null,
            completed_at: null,
            created_at: "2026-05-08T10:00:00",
            updated_at: "2026-05-08T10:00:00",
          },
          warnings: [],
        });
      }
      if (url.includes("/settings/privacy")) {
        return jsonResponse({ show_hidden_items: false });
      }
      if (url.includes("/memory-proposals") || url.includes("/memory")) {
        return jsonResponse([]);
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <MemoryRouter>
        <ProjectWorkspaceRoute projectId="project-1" />
      </MemoryRouter>,
    );

    expect(
      (await screen.findByRole("link", { name: "Открыть рассказчика" })).getAttribute("href"),
    ).toBe("/projects/project-1/sessions/session-1/narrator");
  });
});
