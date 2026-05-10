// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../../shared/testing";
import { DraftAssemblyRoute } from "./DraftAssemblyRoute";

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

const project = {
  id: "project-1",
  title: "Memory Courier",
  synopsis: "A courier finds a future memory.",
  status: "active",
  active_provider_id: "provider-1",
  active_model_id: "model-1",
  expansion_policy: "ask",
  is_hidden: false,
  created_at: "2026-05-09T10:00:00",
  updated_at: "2026-05-09T10:00:00",
  archived_at: null,
};

const chapter = {
  id: "chapter-1",
  project_id: "project-1",
  title: "Archive Door",
  order_index: 1,
  status: "session_done",
  synopsis: "Start at the archive.",
  draft_markdown: "",
  final_markdown: "",
  session_id: "session-1",
  created_at: "2026-05-09T10:00:00",
  updated_at: "2026-05-09T10:00:00",
};

const session = {
  id: "session-1",
  project_id: "project-1",
  chapter_id: "chapter-1",
  status: "completed",
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
  started_at: "2026-05-09T10:00:00",
  paused_at: null,
  completed_at: "2026-05-09T10:10:00",
  created_at: "2026-05-09T10:00:00",
  updated_at: "2026-05-09T10:10:00",
};

const providers = [
  {
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
    created_at: "2026-05-09T10:00:00",
    updated_at: "2026-05-09T10:00:00",
    models: [
      {
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
        created_at: "2026-05-09T10:00:00",
        updated_at: "2026-05-09T10:00:00",
      },
    ],
  },
];

function workspaceSummary() {
  return {
    project,
    runtime: {
      read_only: false,
      ai_available: true,
      reason: null,
      active_provider: providers[0],
      active_model: providers[0].models[0],
    },
    next_step: {
      code: "assemble_draft",
      label: "Собрать черновик",
      detail: null,
      href: "/projects/project-1/sessions/session-1/draft",
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
    latest_chapter: chapter,
    active_session: session,
    warnings: [],
  };
}

function detail() {
  return {
    project,
    chapter,
    session,
    turns: [
      {
        id: "turn-1",
        session_id: "session-1",
        turn_index: 1,
        actor_type: "ai",
        turn_type: "narration",
        content: "Ты стоишь у двери архива.",
        related_memory_item_ids: [],
        related_story_line_ids: [],
        is_key_event: false,
        exclude_from_draft: false,
        created_at: "2026-05-09T10:00:00",
      },
    ],
    suggested_actions: [],
    key_events: [
      {
        id: "event-1",
        project_id: "project-1",
        session_id: "session-1",
        chapter_id: "chapter-1",
        source_turn_id: "turn-1",
        title: "Архив открыт",
        summary: "Дверь открылась.",
        consequences: null,
        related_memory_item_ids: [],
        related_story_line_ids: [],
        include_in_draft: true,
        created_at: "2026-05-09T10:00:00",
      },
    ],
    memory_proposals: [],
    warnings: [],
  };
}

describe("DraftAssemblyRoute", () => {
  it("uses selected model settings for draft assembly and AI assist", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes("/workspace-summary")) {
        return jsonResponse(workspaceSummary());
      }
      if (url === "/api/sessions/session-1") {
        return jsonResponse(detail());
      }
      if (url === "/api/providers") {
        return jsonResponse(providers);
      }
      if (url === "/api/projects/project-1/chapters/chapter-1/draft-versions") {
        return jsonResponse([]);
      }
      if (url === "/api/sessions/session-1/assemble-draft") {
        return jsonResponse({
          project,
          chapter: { ...chapter, draft_markdown: "Собранный черновик." },
          session: { ...session, status: "draft_ready" },
          draft_version: {
            id: "draft-1",
            project_id: "project-1",
            chapter_id: "chapter-1",
            source_session_id: "session-1",
            mode: "literary",
            markdown: "Собранный черновик.",
            status: "generated",
            created_at: "2026-05-09T10:20:00",
          },
          warnings: [],
        });
      }
      if (url === "/api/projects/project-1/chapters/chapter-1/draft/assist") {
        return jsonResponse({
          replacement_markdown: "Исправленный фрагмент.",
          rationale: null,
          warnings: [],
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <MemoryRouter>
        <DraftAssemblyRoute projectId="project-1" sessionId="session-1" />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Модель ассистента" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Температура"), { target: { value: "0.35" } });
    fireEvent.change(screen.getByLabelText("Top P"), { target: { value: "0.8" } });

    fireEvent.click(screen.getByRole("button", { name: /Собрать черновик/ }));
    await waitFor(() => {
      const assembleCall = fetchMock.mock.calls.find(
        ([url, init]) => url === "/api/sessions/session-1/assemble-draft" && init?.method === "POST",
      );
      expect(JSON.parse(String(assembleCall?.[1]?.body))).toMatchObject({
        mode: "literary",
        provider_id: "provider-1",
        model_id: "model-1",
        temperature: 0.35,
        top_p: 0.8,
      });
    });

    fireEvent.change(screen.getByLabelText("Фрагмент markdown"), {
      target: { value: "Собранный черновик." },
    });
    fireEvent.change(screen.getByLabelText("Инструкция для AI правки"), {
      target: { value: "Сделай короче." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Предложить правку" }));
    await waitFor(() => {
      const assistCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          url === "/api/projects/project-1/chapters/chapter-1/draft/assist" &&
          init?.method === "POST",
      );
      expect(JSON.parse(String(assistCall?.[1]?.body))).toMatchObject({
        selection_markdown: "Собранный черновик.",
        instructions: "Сделай короче.",
        provider_id: "provider-1",
        model_id: "model-1",
        temperature: 0.35,
        top_p: 0.8,
      });
    });
  });
});
