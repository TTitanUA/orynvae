// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  initializeFrontendDebugLogging,
  isFrontendDebugLoggingEnabled,
  resetFrontendDebugLoggingForTests,
} from "./debugLogging";

afterEach(() => {
  resetFrontendDebugLoggingForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("initializeFrontendDebugLogging", () => {
  it("keeps frontend logging disabled when the backend says debug is off", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ enabled: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    window.fetch = fetchMock;

    await initializeFrontendDebugLogging();

    assertOnlyStatusRequest(fetchMock);
    expect(isFrontendDebugLoggingEnabled()).toBe(false);
  });

  it("logs frontend system and LLM fetch events when debug is enabled", async () => {
    const posted: Array<{ entries: unknown[] }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "/api/debug/logs" && init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)));
        return new Response(null, { status: 204 });
      }
      if (url === "/api/debug/logs") {
        return new Response(JSON.stringify({ enabled: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("ok", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    window.fetch = fetchMock;

    await initializeFrontendDebugLogging();
    await window.fetch("/api/debug/logs/future", { method: "GET" });
    await window.fetch("/api/projects/setup/analyze", {
      method: "POST",
      body: JSON.stringify({ idea_text: "test" }),
    });
    await window.fetch("/api/ai-actions/execute", {
      method: "POST",
      body: JSON.stringify({ action_type: "summarize_session" }),
    });
    await Promise.resolve();
    await Promise.resolve();

    const entries = posted.flatMap((batch) => batch.entries) as Array<{
      category: string;
      operation: string;
      payload: Record<string, unknown>;
    }>;
    expect(isFrontendDebugLoggingEnabled()).toBe(true);
    expect(entries.some((entry) => entry.operation === "frontend.debug.enabled")).toBe(true);
    expect(
      entries.some((entry) => entry.category === "LLM" && entry.operation === "fetch.llm.start"),
    ).toBe(true);
    expect(
      entries.some((entry) => entry.category === "LLM" && entry.operation === "fetch.llm.end"),
    ).toBe(true);
    expect(
      entries.some(
        (entry) =>
          entry.category === "LLM" &&
          entry.operation === "fetch.llm.start" &&
          entry.payload?.url === "/api/ai-actions/execute",
      ),
    ).toBe(true);
    expect(
      entries.some((entry) => entry.payload?.url === "/api/debug/logs/future"),
    ).toBe(false);
  });
});

function assertOnlyStatusRequest(fetchMock: ReturnType<typeof vi.fn>): void {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/debug/logs",
    expect.objectContaining({ cache: "no-store" }),
  );
}
