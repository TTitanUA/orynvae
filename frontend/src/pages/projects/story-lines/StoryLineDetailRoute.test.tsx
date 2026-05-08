// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../../shared/testing";
import { StoryLineDetailRoute } from "./StoryLineDetailRoute";

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

function workspaceSummary() {
  return {
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
  };
}

function storyLine(title = "Death memory source") {
  return {
    id: "line-1",
    project_id: "project-1",
    type: "mystery",
    title,
    description: "Who sent it?",
    current_state: "No one knows yet.",
    status: "active",
    priority: 2,
    last_progress_chapter_id: null,
    created_at: "2026-05-08T10:00:00",
    updated_at: "2026-05-08T10:00:00",
  };
}

function providers() {
  return [
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
  ];
}

describe("StoryLineDetailRoute", () => {
  it("loads an editable line with history and saves changes", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes("/workspace-summary")) {
        return jsonResponse(workspaceSummary());
      }
      if (url === "/api/providers") {
        return jsonResponse(providers());
      }
      if (url.endsWith("/story-lines/line-1/progress")) {
        return jsonResponse({
          story_line: storyLine(),
          progress: [
            {
              id: "progress-1",
              project_id: "project-1",
              story_line_id: "line-1",
              chapter_id: null,
              session_id: null,
              before_state: "No one knows yet.",
              after_state: "The archive mark appears on the package.",
              event_summary: "A new clue points toward the archive.",
              created_at: "2026-05-08T10:00:00",
            },
          ],
        });
      }
      if (url.endsWith("/story-lines/line-1") && init?.method === "PATCH") {
        return jsonResponse(storyLine("Death memory source"));
      }
      if (url.endsWith("/story-lines/line-1")) {
        return jsonResponse(storyLine());
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <MemoryRouter>
        <StoryLineDetailRoute lineId="line-1" projectId="project-1" />
      </MemoryRouter>,
    );

    expect(await screen.findByDisplayValue("Death memory source")).toBeTruthy();
    expect(await screen.findByText("A new clue points toward the archive.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Текущее состояние"), {
      target: { value: "The archive may be involved." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Сохранить/ }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/project-1/story-lines/line-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            type: "mystery",
            title: "Death memory source",
            description: "Who sent it?",
            current_state: "The archive may be involved.",
            status: "active",
            priority: 2,
          }),
        }),
      ),
    );
  });

  it("uses the assistant to revise an existing line draft", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes("/workspace-summary")) {
        return jsonResponse(workspaceSummary());
      }
      if (url === "/api/providers") {
        return jsonResponse(providers());
      }
      if (url.endsWith("/story-lines/line-1/progress")) {
        return jsonResponse({
          story_line: storyLine(),
          progress: [],
        });
      }
      if (url.endsWith("/story-lines/suggest") && init?.method === "POST") {
        return jsonResponse({
          story_lines: [
            {
              type: "mystery",
              title: "Archive trail",
              description: "The delivery now points toward a hidden archive faction.",
              current_state: "The archive mark appears on the package.",
              priority: 4,
              reason: null,
            },
          ],
          warnings: [],
        });
      }
      if (url.endsWith("/story-lines/line-1")) {
        return jsonResponse(storyLine());
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <MemoryRouter>
        <StoryLineDetailRoute lineId="line-1" projectId="project-1" />
      </MemoryRouter>,
    );

    expect(await screen.findByDisplayValue("Death memory source")).toBeTruthy();
    fireEvent.change(await screen.findByLabelText("Reasoning"), { target: { value: "medium" } });
    fireEvent.change(
      screen.getByPlaceholderText("Например: сделай конфликт яснее и обнови текущее состояние"),
      {
        target: { value: "Сделай загадку понятнее" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: /Предложить правку/ }));

    expect(await screen.findByDisplayValue("Archive trail")).toBeTruthy();
    expect(screen.getByDisplayValue("The archive mark appears on the package.")).toBeTruthy();
    const suggestCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/story-lines/suggest"),
    );
    const body = JSON.parse(String(suggestCall?.[1]?.body));
    expect(body).toMatchObject({
      max_suggestions: 1,
      provider_id: "provider-1",
      model_id: "story-model",
      temperature: 0.7,
      top_p: 0.9,
      reasoning_effort: "medium",
    });
    expect(body.instructions).toContain("Помоги отредактировать существующую линию истории.");
    expect(body.instructions).toContain("Название: Death memory source");
    expect(body.instructions).toContain("Задача пользователя: Сделай загадку понятнее");
  });

  it("uses the creation assistant to draft and create a line", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes("/workspace-summary")) {
        return jsonResponse(workspaceSummary());
      }
      if (url === "/api/providers") {
        return jsonResponse(providers());
      }
      if (url.endsWith("/story-lines/suggest")) {
        return jsonResponse({
          story_lines: [
            {
              type: "relationship",
              title: "Trust under pressure",
              description: "A fragile friendship strains under secrets.",
              current_state: "They still trust each other.",
              priority: 1,
              reason: null,
            },
          ],
          warnings: [],
        });
      }
      if (url.endsWith("/story-lines") && init?.method === "POST") {
        return jsonResponse({
          ...storyLine("Trust under pressure"),
          id: "line-created",
          type: "relationship",
          description: "A fragile friendship strains under secrets.",
          current_state: "They still trust each other.",
          status: "proposed",
          priority: 1,
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <MemoryRouter>
        <StoryLineDetailRoute projectId="project-1" />
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText("Reasoning"), { target: { value: "medium" } });
    fireEvent.change(await screen.findByPlaceholderText("Например: линия доверия между героем и старшим другом"), {
      target: { value: "Линия доверия" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Собрать линию/ }));

    expect(await screen.findByDisplayValue("Trust under pressure")).toBeTruthy();
    const suggestCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/story-lines/suggest"),
    );
    expect(JSON.parse(String(suggestCall?.[1]?.body))).toEqual({
      instructions: "Линия доверия",
      max_suggestions: 1,
      provider_id: "provider-1",
      model_id: "story-model",
      temperature: 0.7,
      top_p: 0.9,
      reasoning_effort: "medium",
    });
    fireEvent.click(screen.getByRole("button", { name: /Создать/ }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/project-1/story-lines",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            type: "relationship",
            title: "Trust under pressure",
            description: "A fragile friendship strains under secrets.",
            current_state: "They still trust each other.",
            status: "proposed",
            priority: 1,
          }),
        }),
      ),
    );
  });
});
