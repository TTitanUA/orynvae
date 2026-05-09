// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../../shared/testing";
import { ChapterPrepareRoute } from "./ChapterPrepareRoute";

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
      if (url.includes("/providers")) {
        return jsonResponse([]);
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
    expect((await screen.findByText("Модель ассистента")).textContent).toBe("Модель ассистента");
    expect((await screen.findByText("Courier")).textContent).toBe("Courier");
    expect(screen.getByRole("button", { name: /Подготовить с AI/ })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("sends selected assistant model settings when preparing a chapter", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      void init;
      if (url.includes("/session/prepare")) {
        return jsonResponse({
          chapter: {
            id: "chapter-1",
            project_id: "project-1",
            title: "First delivery",
            order_index: 1,
            status: "planned",
            synopsis: "Start at the archive.",
            draft_markdown: "",
            final_markdown: "",
            session_id: "session-1",
            created_at: "2026-05-08T10:00:00",
            updated_at: "2026-05-08T10:00:00",
          },
          session: {
            id: "session-1",
            project_id: "project-1",
            chapter_id: "chapter-1",
            status: "preparing",
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
          opening_turn: null,
          narrator_opening: "Ты стоишь у двери архива.",
          suggested_actions: [],
          relevant_memory_titles: [],
          warnings: [],
          chapter_intention: null,
          start_situation: null,
          participant_titles: [],
          possible_line_movements: [],
          coherence_risks: [],
        });
      }
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
              id: "model-record-1",
              provider_id: "provider-1",
              model_id: "model-1",
              display_name: "Default Model",
              supports_streaming: true,
              is_allowed: true,
            },
          },
          next_step: {
            code: "prepare_first_chapter",
            label: "Подготовить главу",
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
      if (url.includes("/providers")) {
        return jsonResponse([
          {
            id: "provider-1",
            type: "lmstudio",
            name: "Local AI",
            base_url: "http://localhost:1234/v1",
            has_api_key: false,
            is_local: true,
            is_external: false,
            is_enabled: true,
            is_default: true,
            streaming_enabled: true,
            models_path: "/models",
            chat_path: "/chat/completions",
            default_model_id: "model-1",
            last_checked_at: null,
            last_error: null,
            created_at: "2026-05-08T10:00:00",
            updated_at: "2026-05-08T10:00:00",
            models: [
              {
                id: "model-record-1",
                provider_id: "provider-1",
                model_id: "model-1",
                display_name: "Default Model",
                supports_streaming: true,
                context_window: null,
                capabilities: { supported_parameters: ["temperature", "top_p", "reasoning.effort"] },
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
        return jsonResponse([]);
      }
      if (url.includes("/story-lines")) {
        return jsonResponse([]);
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <MemoryRouter>
        <ChapterPrepareRoute chapterId="chapter-1" projectId="project-1" />
      </MemoryRouter>,
    );

    await screen.findByText("Модель ассистента");
    fireEvent.change(await screen.findByRole("slider", { name: "Температура" }), {
      target: { value: "0.4" },
    });
    fireEvent.change(screen.getByRole("slider", { name: "Top P" }), {
      target: { value: "0.85" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Reasoning" }), {
      target: { value: "high" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Подготовить с AI/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/project-1/chapters/chapter-1/session/prepare",
        expect.objectContaining({
          method: "POST",
          body: expect.any(String),
        }),
      );
    });
    expect(
      (await screen.findByRole("link", { name: "Открыть рассказчика" })).getAttribute("href"),
    ).toBe("/projects/project-1/sessions/session-1/narrator");
    const prepareCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/session/prepare"));
    expect(JSON.parse(String(prepareCall?.[1]?.body))).toMatchObject({
      provider_id: "provider-1",
      model_id: "model-1",
      temperature: 0.4,
      top_p: 0.85,
      reasoning_effort: "high",
    });
  });
});
