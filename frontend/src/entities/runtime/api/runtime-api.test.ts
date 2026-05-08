import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchRuntimeStatus } from "./runtime-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchRuntimeStatus", () => {
  it("loads read-only status from the runtime endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          read_only: true,
          ai_available: false,
          reason: "AI provider is not configured",
          active_provider: null,
          active_model: null,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchRuntimeStatus()).resolves.toMatchObject({
      read_only: true,
      ai_available: false,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/runtime/status",
      expect.objectContaining({ cache: "no-store" }),
    );
  });
});
