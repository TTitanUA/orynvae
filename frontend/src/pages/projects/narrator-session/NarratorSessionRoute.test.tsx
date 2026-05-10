// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../../shared/testing";
import { NarratorSessionRoute } from "./NarratorSessionRoute";

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
  status: "in_session",
  synopsis: "Start at the archive.",
  draft_markdown: "",
  final_markdown: "",
  session_id: "session-1",
  created_at: "2026-05-09T10:00:00",
  updated_at: "2026-05-09T10:00:00",
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
        capabilities: { supported_parameters: ["temperature", "top_p", "reasoning_effort"] },
        is_allowed: true,
        routing_config: null,
        last_seen_at: null,
        created_at: "2026-05-09T10:00:00",
        updated_at: "2026-05-09T10:00:00",
      },
    ],
  },
];

function session(status = "active") {
  return {
    id: "session-1",
    project_id: "project-1",
    chapter_id: "chapter-1",
    status,
    user_role: "single_character",
    controlled_character_ids: ["memory-1"],
    active_story_line_ids: ["line-1"],
    tone: "tense",
    pace: "medium",
    expansion_policy_override: null,
    agent_instructions: "Keep it tense.",
    agent_temperature: 0.7,
    agent_top_p: null,
    agent_reasoning_effort: null,
    started_at: "2026-05-09T10:00:00",
    paused_at: null,
    completed_at: null,
    created_at: "2026-05-09T10:00:00",
    updated_at: "2026-05-09T10:00:00",
  };
}

const turns = [
  {
    id: "turn-1",
    session_id: "session-1",
    turn_index: 1,
    actor_type: "ai",
    turn_type: "narration",
    content: "Ты стоишь у двери архива.",
    related_memory_item_ids: ["memory-1"],
    related_story_line_ids: ["line-1"],
    is_key_event: false,
    exclude_from_draft: false,
    created_at: "2026-05-09T10:00:00",
  },
];

const suggestedActions = [
  {
    id: "action-1",
    session_id: "session-1",
    source_turn_id: "turn-1",
    action_index: 1,
    label: "Спрятать капсулу",
    action: "Спрятать воспоминание и спросить про охрану.",
    tone: "осторожно",
    status: "suggested",
    selected_turn_id: null,
    created_at: "2026-05-09T10:00:00",
  },
];

function detail(status = "active") {
  return {
    project,
    chapter: { ...chapter, status: status === "completed" ? "session_done" : "in_session" },
    session: session(status),
    turns,
    suggested_actions: suggestedActions,
    key_events: [
      {
        id: "event-1",
        project_id: "project-1",
        session_id: "session-1",
        chapter_id: "chapter-1",
        source_turn_id: "turn-1",
        title: "Архивариус заметил капсулу",
        summary: "Он скрыл реакцию.",
        consequences: null,
        related_memory_item_ids: [],
        related_story_line_ids: [],
        include_in_draft: true,
        created_at: "2026-05-09T10:00:00",
      },
    ],
    memory_proposals: [
      {
        id: "proposal-1",
        project_id: "project-1",
        proposal_type: "new_fact",
        target_item_id: null,
        suggested_payload: { type: "canon_fact", title: "Архивариус знает капсулу" },
        reason: "Кандидат после хода.",
        source_type: "session_turn",
        source_id: "turn-1",
        status: "pending",
        created_at: "2026-05-09T10:00:00",
      },
    ],
    warnings: [],
  };
}

function workspaceSummary(readOnly = false, status = "active") {
  return {
    project,
    runtime: {
      read_only: readOnly,
      ai_available: !readOnly,
      reason: readOnly ? "AI provider is not configured" : null,
      active_provider: readOnly
        ? null
        : {
            id: "provider-1",
            type: "lmstudio",
            name: "Local AI",
            is_external: false,
            is_enabled: true,
            last_checked_at: null,
            last_error: null,
          },
      active_model: readOnly
        ? null
        : {
            id: "model-record-1",
            provider_id: "provider-1",
            model_id: "model-1",
            display_name: "Default Model",
            supports_streaming: true,
            is_allowed: true,
          },
    },
    next_step: {
      code: "continue_session",
      label: "Открыть рассказчика",
      detail: null,
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
    latest_chapter: chapter,
    active_session: session(status),
    warnings: readOnly ? ["AI provider is not configured"] : [],
  };
}

describe("NarratorSessionRoute", () => {
  it("renders saved session in read-only mode", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/workspace-summary")) {
        return jsonResponse(workspaceSummary(true));
      }
      if (url === "/api/providers") {
        return jsonResponse(providers);
      }
      if (url === "/api/sessions/session-1") {
        return jsonResponse(detail("active"));
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <MemoryRouter>
        <NarratorSessionRoute projectId="project-1" sessionId="session-1" />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Archive Door")).toBeTruthy();
    expect(await screen.findByText("Только чтение")).toBeTruthy();
    expect(await screen.findByText("Ты стоишь у двери архива.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Отправить ход/ })).toHaveProperty("disabled", true);
  });

  it("starts, submits, pauses and completes a narrator session", async () => {
    let currentStatus = "paused";
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      void init;
      if (url.includes("/workspace-summary")) {
        return jsonResponse(workspaceSummary(false, currentStatus));
      }
      if (url === "/api/providers") {
        return jsonResponse(providers);
      }
      if (url === "/api/sessions/session-1/start") {
        currentStatus = "active";
        return jsonResponse(detail("active"));
      }
      if (url === "/api/sessions/session-1/turns") {
        return jsonResponse({
          session: session("active"),
          user_turn: { ...turns[0], id: "turn-user", actor_type: "user", turn_index: 2 },
          ai_turn: { ...turns[0], id: "turn-ai", turn_index: 3, content: "Архивариус ждет." },
          suggested_actions: [],
          key_event_candidates: [],
          memory_proposal_candidates: [],
          story_line_update_candidates: [],
          warnings: [],
        });
      }
      if (url === "/api/sessions/session-1/pause") {
        currentStatus = "paused";
        return jsonResponse(detail("paused"));
      }
      if (url === "/api/sessions/session-1/complete") {
        currentStatus = "completed";
        return jsonResponse(detail("completed"));
      }
      if (url === "/api/sessions/session-1") {
        return jsonResponse(detail(currentStatus));
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <MemoryRouter>
        <NarratorSessionRoute projectId="project-1" sessionId="session-1" />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Продолжить/ }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/sessions/session-1/start",
        expect.objectContaining({ method: "POST" }),
      );
    });

    fireEvent.change(screen.getByPlaceholderText(/Опиши действие/), {
      target: { value: "Я прячу капсулу." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Отправить ход/ }));
    await waitFor(() => {
      const turnCall = fetchMock.mock.calls.find(
        ([url, init]) => url === "/api/sessions/session-1/turns" && init?.method === "POST",
      );
      expect(JSON.parse(String(turnCall?.[1]?.body))).toMatchObject({
        input_type: "action",
        content: "Я прячу капсулу.",
        provider_id: "provider-1",
        model_id: "model-1",
        temperature: 0.7,
        top_p: 0.9,
        reasoning_effort: null,
      });
    });
    expect(await screen.findByText("Архивариус ждет.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Пауза/ }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/sessions/session-1/pause",
        expect.objectContaining({ method: "POST" }),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /Завершить/ }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/sessions/session-1/complete",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("sends selected quick action id and supports log updates", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      void init;
      if (url.includes("/workspace-summary")) {
        return jsonResponse(workspaceSummary(false));
      }
      if (url === "/api/providers") {
        return jsonResponse(providers);
      }
      if (url === "/api/sessions/session-1/turns") {
        return jsonResponse({
          session: session("active"),
          user_turn: { ...turns[0], id: "turn-user", actor_type: "user", turn_index: 2 },
          ai_turn: { ...turns[0], id: "turn-ai", turn_index: 3, content: "Архивариус ждет." },
          suggested_actions: [],
          key_event_candidates: [],
          memory_proposal_candidates: [],
          story_line_update_candidates: [],
          warnings: [],
        });
      }
      if (url === "/api/sessions/session-1/suggested-actions/regenerate") {
        return jsonResponse({
          session: session("active"),
          source_turn: turns[0],
          suggested_actions: [
            {
              ...suggestedActions[0],
              id: "action-regenerated",
              label: "Новый осторожный вариант",
            },
          ],
          warnings: [],
        });
      }
      if (url === "/api/sessions/session-1/turns/turn-1") {
        return jsonResponse({ ...turns[0], exclude_from_draft: true });
      }
      if (url === "/api/sessions/session-1/key-events/event-1") {
        return jsonResponse({ ...detail().key_events[0], include_in_draft: false });
      }
      if (url === "/api/sessions/session-1") {
        return jsonResponse(detail("active"));
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <MemoryRouter>
        <NarratorSessionRoute projectId="project-1" sessionId="session-1" />
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByPlaceholderText(/Промпт для вариантов/), {
      target: { value: "Сделай варианты осторожнее." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Перегенерировать варианты/ }));
    await waitFor(() => {
      const actionsCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          url === "/api/sessions/session-1/suggested-actions/regenerate" &&
          init?.method === "POST",
      );
      expect(JSON.parse(String(actionsCall?.[1]?.body))).toMatchObject({
        source_turn_id: "turn-1",
        prompt: "Сделай варианты осторожнее.",
        provider_id: "provider-1",
        model_id: "model-1",
        temperature: 0.7,
        top_p: 0.9,
        reasoning_effort: null,
      });
    });

    fireEvent.click(await screen.findByRole("button", { name: /Новый осторожный вариант/ }));
    fireEvent.click(screen.getByRole("button", { name: /Отправить ход/ }));
    await waitFor(() => {
      const turnCall = fetchMock.mock.calls.find(
        ([url, init]) => url === "/api/sessions/session-1/turns" && init?.method === "POST",
      );
      expect(JSON.parse(String(turnCall?.[1]?.body))).toMatchObject({
        input_type: "choice",
        selected_option_id: "action-regenerated",
        provider_id: "provider-1",
        model_id: "model-1",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: /Лог/ }));
    const excludeCheckboxes = await screen.findAllByLabelText("Не включать в черновик");
    fireEvent.click(excludeCheckboxes[0]);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/sessions/session-1/turns/turn-1",
        expect.objectContaining({ method: "PATCH" }),
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /Сохранить событие/ }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/sessions/session-1/key-events/event-1",
        expect.objectContaining({ method: "PATCH" }),
      );
    });
  });

  it("shows narrator generation status while a submitted turn is pending", async () => {
    let resolveTurn!: (response: Response) => void;
    const turnResponse = new Promise<Response>((resolve) => {
      resolveTurn = resolve;
    });
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      void init;
      if (url.includes("/workspace-summary")) {
        return jsonResponse(workspaceSummary(false));
      }
      if (url === "/api/providers") {
        return jsonResponse(providers);
      }
      if (url === "/api/sessions/session-1/turns") {
        return turnResponse;
      }
      if (url === "/api/sessions/session-1") {
        return jsonResponse(detail("active"));
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <MemoryRouter>
        <NarratorSessionRoute projectId="project-1" sessionId="session-1" />
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByPlaceholderText(/Опиши действие/), {
      target: { value: "Я жду ответа." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Отправить ход/ }));

    expect(await screen.findByText("Я жду ответа.")).toBeTruthy();
    expect(await screen.findByText("отправлено, ждет ответа")).toBeTruthy();
    expect(await screen.findByText("Рассказчик генерирует продолжение сцены...")).toBeTruthy();

    resolveTurn(
      new Response(
        JSON.stringify({
          session: session("active"),
          user_turn: { ...turns[0], id: "turn-user", actor_type: "user", turn_index: 2 },
          ai_turn: { ...turns[0], id: "turn-ai", turn_index: 3, content: "Архивариус ждет." },
          suggested_actions: [],
          key_event_candidates: [],
          memory_proposal_candidates: [],
          story_line_update_candidates: [],
          warnings: [],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    expect(await screen.findByText("Архивариус ждет.")).toBeTruthy();
  });

  it("updates agent settings and sends regenerate and rollback requests", async () => {
    const userTurn = {
      ...turns[0],
      id: "turn-user",
      actor_type: "user",
      turn_type: "action",
      turn_index: 2,
      content: "Я проверяю дверь.",
    };
    const aiTurn = {
      ...turns[0],
      id: "turn-ai",
      turn_index: 3,
      content: "Дверь тихо отвечает сквозняком.",
    };
    const playbackDetail = {
      ...detail("active"),
      turns: [turns[0], userTurn, aiTurn],
      suggested_actions: [],
    };
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      void init;
      if (url.includes("/workspace-summary")) {
        return jsonResponse(workspaceSummary(false));
      }
      if (url === "/api/providers") {
        return jsonResponse(providers);
      }
      if (url === "/api/sessions/session-1/agent-settings") {
        return jsonResponse(playbackDetail);
      }
      if (url === "/api/sessions/session-1/turns/regenerate-last") {
        return jsonResponse(playbackDetail);
      }
      if (url === "/api/sessions/session-1/rollback") {
        return jsonResponse(playbackDetail);
      }
      if (url === "/api/sessions/session-1") {
        return jsonResponse(playbackDetail);
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <MemoryRouter>
        <NarratorSessionRoute projectId="project-1" sessionId="session-1" />
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByPlaceholderText(/Стиль/), {
      target: { value: "Пиши суше и тревожнее." },
    });
    fireEvent.change(screen.getByLabelText("Температура"), { target: { value: "0.35" } });
    fireEvent.change(screen.getByLabelText("Reasoning"), { target: { value: "high" } });
    fireEvent.click(screen.getByRole("button", { name: /Сохранить настройки/ }));
    await waitFor(() => {
      const settingsCall = fetchMock.mock.calls.find(
        ([url, init]) => url === "/api/sessions/session-1/agent-settings" && init?.method === "PATCH",
      );
      expect(JSON.parse(String(settingsCall?.[1]?.body))).toMatchObject({
        agent_instructions: "Пиши суше и тревожнее.",
        agent_temperature: 0.35,
        agent_top_p: 0.9,
        agent_reasoning_effort: "high",
      });
    });

    fireEvent.change(screen.getByPlaceholderText(/Комментарий для перегенерации/), {
      target: { value: "Меньше прямого объяснения." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Перегенерировать последний narration/ }));
    await waitFor(() => {
      const regenerateCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          url === "/api/sessions/session-1/turns/regenerate-last" && init?.method === "POST",
      );
      expect(JSON.parse(String(regenerateCall?.[1]?.body))).toMatchObject({
        comment: "Меньше прямого объяснения.",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: /Лог/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Оставить ход, перегенерировать/ }));
    await waitFor(() => {
      const rollbackCall = fetchMock.mock.calls.find(
        ([url, init]) => url === "/api/sessions/session-1/rollback" && init?.method === "POST",
      );
      expect(JSON.parse(String(rollbackCall?.[1]?.body))).toMatchObject({
        target_turn_id: "turn-user",
        user_turn_mode: "keep",
      });
    });
  });
});
