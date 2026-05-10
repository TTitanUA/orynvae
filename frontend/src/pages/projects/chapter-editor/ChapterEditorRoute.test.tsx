// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../../shared/testing";
import { ChapterEditorRoute } from "./ChapterEditorRoute";

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

const provider = {
  id: "provider-1",
  type: "lmstudio",
  name: "Local AI",
  base_url: "http://127.0.0.1:1234",
  has_api_key: false,
  is_local: true,
  is_external: false,
  is_enabled: true,
  is_default: true,
  streaming_enabled: true,
  models_path: "/v1/models",
  chat_path: "/v1/chat/completions",
  default_model_id: "model-1",
  last_checked_at: null,
  last_error: null,
  created_at: "2026-05-10T10:00:00",
  updated_at: "2026-05-10T10:00:00",
};

const model = {
  id: "model-record-1",
  provider_id: "provider-1",
  model_id: "model-1",
  display_name: "Default Model",
  supports_streaming: true,
  context_window: null,
  capabilities: { supported_parameters: ["temperature", "top_p"] },
  is_allowed: true,
  routing_config: null,
  last_seen_at: null,
  created_at: "2026-05-10T10:00:00",
  updated_at: "2026-05-10T10:00:00",
};

const project = {
  id: "project-1",
  title: "Memory Courier",
  synopsis: "A courier finds a future memory.",
  status: "active",
  active_provider_id: "provider-1",
  active_model_id: "model-1",
  default_temperature: 0.7,
  default_top_p: 0.9,
  expansion_policy: "ask",
  is_hidden: false,
  created_at: "2026-05-10T10:00:00",
  updated_at: "2026-05-10T10:00:00",
  archived_at: null,
};

const chapter = {
  id: "chapter-1",
  project_id: "project-1",
  title: "Archive Door",
  order_index: 1,
  status: "draft_generated",
  synopsis: "Start at the archive.",
  draft_markdown: "Черновик из главы.",
  final_markdown: "",
  session_id: "session-1",
  created_at: "2026-05-10T10:00:00",
  updated_at: "2026-05-10T10:20:00",
};

const draft = {
  id: "draft-1",
  project_id: "project-1",
  chapter_id: "chapter-1",
  source_session_id: "session-1",
  mode: "literary",
  markdown: "Текущий markdown редактора.",
  status: "edited",
  created_at: "2026-05-10T10:30:00",
};

function workspaceSummary(readOnly = false) {
  return {
    project,
    runtime: {
      read_only: readOnly,
      ai_available: !readOnly,
      reason: readOnly ? "AI недоступен" : null,
      active_provider: readOnly ? null : provider,
      active_model: readOnly ? null : model,
    },
    next_step: { code: "review_chapter", label: "Разбор", detail: null, href: null },
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
    latest_chapter: chapter,
    active_session: null,
    warnings: [],
  };
}

function aiSettings() {
  return {
    project_id: "project-1",
    active_provider_id: "provider-1",
    active_model_id: "model-1",
    default_temperature: 0.7,
    default_top_p: 0.9,
    runtime: workspaceSummary().runtime,
    active_provider: provider,
    active_model: model,
    agents: [
      {
        agent_key: "draft_fragment_editor",
        label: "Редактор фрагмента",
        temperature_source: "agent_default",
        temperature_value: null,
        effective_temperature: 0.55,
        preset_temperature: 0.55,
        top_p_source: "project",
        top_p_value: null,
        effective_top_p: 0.9,
        preset_top_p: null,
      },
    ],
    warnings: [],
  };
}

function sessionDetail() {
  return {
    project,
    chapter,
    session: {
      id: "session-1",
      project_id: "project-1",
      chapter_id: "chapter-1",
      status: "draft_ready",
      user_role: "author",
      controlled_character_ids: [],
      active_story_line_ids: [],
      tone: null,
      pace: null,
      expansion_policy_override: null,
      agent_instructions: null,
      agent_temperature: null,
      agent_top_p: null,
      agent_reasoning_effort: null,
      started_at: null,
      paused_at: null,
      completed_at: null,
      created_at: "2026-05-10T10:00:00",
      updated_at: "2026-05-10T10:00:00",
    },
    turns: [],
    suggested_actions: [],
    key_events: [],
    memory_proposals: [],
    warnings: [],
  };
}

function renderRoute() {
  const router = createMemoryRouter(
    [
      {
        path: "/projects/:projectId/chapters/:chapterId/editor",
        element: <ChapterEditorRoute chapterId="chapter-1" projectId="project-1" />,
      },
    ],
    { initialEntries: ["/projects/project-1/chapters/chapter-1/editor"] },
  );
  return renderWithProviders(<RouterProvider router={router} />);
}

describe("ChapterEditorRoute", () => {
  it("sends current editor markdown to document assist and keeps preview explicit", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      void init;
      if (url.includes("/workspace-summary")) {
        return jsonResponse(workspaceSummary());
      }
      if (url === "/api/projects/project-1/chapters/chapter-1") {
        return jsonResponse(chapter);
      }
      if (url === "/api/projects/project-1/chapters/chapter-1/draft-versions") {
        return jsonResponse([draft]);
      }
      if (url === "/api/projects/project-1/memory?status=canon") {
        return jsonResponse([]);
      }
      if (url === "/api/projects/project-1/story-lines?status=active") {
        return jsonResponse([]);
      }
      if (url === "/api/sessions/session-1") {
        return jsonResponse(sessionDetail());
      }
      if (url === "/api/projects/project-1/ai-settings") {
        return jsonResponse(aiSettings());
      }
      if (url === "/api/projects/project-1/chapters/chapter-1/draft/assist") {
        return jsonResponse({
          replacement_markdown: "Улучшенный markdown редактора.",
          rationale: "Ритм стал плотнее.",
          warnings: [],
          variants: [],
        });
      }
      return jsonResponse([]);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderRoute();

    expect(await screen.findByRole("heading", { name: "Archive Door" })).toBeTruthy();
    expect(await screen.findByText("Текущий markdown редактора.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Ритм" }));

    await waitFor(() => {
      const assistCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          url === "/api/projects/project-1/chapters/chapter-1/draft/assist" &&
          init?.method === "POST",
      );
      expect(assistCall).toBeTruthy();
      expect(JSON.parse(String(assistCall?.[1]?.body))).toMatchObject({
        scope: "document",
        action_key: "improve_rhythm",
        selection_markdown: "Текущий markdown редактора.",
        draft_markdown: "Текущий markdown редактора.",
        source_draft_version_id: "draft-1",
      });
    });

    expect(await screen.findByRole("heading", { name: "Preview правки" })).toBeTruthy();
    expect(screen.getByDisplayValue("Текущий markdown редактора.")).toBeTruthy();
    expect(screen.getByDisplayValue("Улучшенный markdown редактора.")).toBeTruthy();
  });

  it("renders saved markdown read-only when AI is unavailable", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/workspace-summary")) {
        return jsonResponse(workspaceSummary(true));
      }
      if (url === "/api/projects/project-1/chapters/chapter-1") {
        return jsonResponse(chapter);
      }
      if (url === "/api/projects/project-1/chapters/chapter-1/draft-versions") {
        return jsonResponse([draft]);
      }
      if (url === "/api/projects/project-1/memory?status=canon") {
        return jsonResponse([]);
      }
      if (url === "/api/projects/project-1/story-lines?status=active") {
        return jsonResponse([]);
      }
      if (url === "/api/sessions/session-1") {
        return jsonResponse(sessionDetail());
      }
      if (url === "/api/projects/project-1/ai-settings") {
        return jsonResponse({ ...aiSettings(), runtime: workspaceSummary(true).runtime });
      }
      return jsonResponse([]);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderRoute();

    expect(await screen.findByText("Текущий markdown редактора.")).toBeTruthy();
    expect(screen.getByText("Редактор открыт только для чтения, пока AI недоступен.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Ритм" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
