// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../../shared/testing";
import { StoryLinesRoute } from "./StoryLinesRoute";

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
    expect(screen.getByRole("link", { name: "Правка" }).getAttribute("href")).toBe(
      "/projects/project-1/story-lines/line-1",
    );
    expect(screen.queryByRole("button", { name: "История" })).toBeNull();
  });

  it("sends the same agent settings shape as project creation for suggestions", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      void init;
      if (url.includes("/workspace-summary")) {
        return jsonResponse({
          project: {
            id: "project-1",
            title: "Memory Courier",
            synopsis: "A courier finds a future memory.",
            status: "active",
            active_provider_id: "provider-1",
            active_model_id: "story-model",
            expansion_policy: "ask",
            created_at: "2026-05-08T10:00:00",
            updated_at: "2026-05-08T10:00:00",
            archived_at: null,
          },
          runtime: {
            read_only: false,
            ai_available: true,
            reason: null,
            active_provider: {
              id: "provider-1",
              type: "lmstudio",
              name: "Local AI",
              is_external: false,
              is_enabled: true,
              last_checked_at: null,
              last_error: null,
            },
            active_model: {
              id: "model-1",
              provider_id: "provider-1",
              model_id: "story-model",
              display_name: "Story Model",
              supports_streaming: false,
              is_allowed: true,
            },
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
      if (url === "/api/providers") {
        return jsonResponse([
          {
            id: "provider-1",
            type: "lmstudio",
            name: "Local AI",
            base_url: "http://localhost:1234",
            has_api_key: false,
            is_local: true,
            is_external: false,
            is_enabled: true,
            is_default: true,
            streaming_enabled: false,
            models_path: null,
            chat_path: null,
            default_model_id: "story-model",
            last_checked_at: null,
            last_error: null,
            created_at: "2026-05-08T10:00:00",
            updated_at: "2026-05-08T10:00:00",
            models: [
              {
                id: "model-1",
                provider_id: "provider-1",
                model_id: "story-model",
                display_name: "Story Model",
                supports_streaming: false,
                context_window: null,
                capabilities: {
                  supported_parameters: ["temperature", "top_p", "reasoning_effort"],
                },
                is_allowed: true,
                routing_config: null,
                last_seen_at: null,
                created_at: "2026-05-08T10:00:00",
                updated_at: "2026-05-08T10:00:00",
              },
            ],
          },
        ]);
      }
      if (url.endsWith("/story-lines/suggest")) {
        return jsonResponse({ story_lines: [], warnings: [] });
      }
      if (url.includes("/story-lines")) {
        return jsonResponse([]);
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <MemoryRouter>
        <StoryLinesRoute projectId="project-1" />
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText("Reasoning"), { target: { value: "medium" } });
    fireEvent.change(screen.getByPlaceholderText("Например: дай одну угрозу и одну линию отношений"), {
      target: { value: "Дай одну угрозу" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Спросить AI/ }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/project-1/story-lines/suggest",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const suggestCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/story-lines/suggest"),
    );
    expect(JSON.parse(String(suggestCall?.[1]?.body))).toEqual({
      instructions: "Дай одну угрозу",
      max_suggestions: 5,
      provider_id: "provider-1",
      model_id: "story-model",
      temperature: 0.7,
      top_p: 0.9,
      reasoning_effort: "medium",
    });
  });

});
