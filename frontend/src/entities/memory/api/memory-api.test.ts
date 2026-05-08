import { afterEach, describe, expect, it, vi } from "vitest";

import {
  acceptMemoryProposal,
  checkMemoryConflicts,
  fetchMemoryItems,
  fetchProjectWorkspaceSummary,
  updateMemoryItemStatus,
} from "./memory-api";
import { memoryQueryKeys } from "../model/memory-query-keys";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("memory API", () => {
  it("keeps stable query keys for workspace, lists and proposals", () => {
    expect(memoryQueryKeys.workspaceSummary("project-1")).toEqual([
      "memory",
      "workspace-summary",
      "project-1",
    ]);
    expect(memoryQueryKeys.list("project-1", { status: "canon" })).toEqual([
      "memory",
      "list",
      "project-1",
      { status: "canon" },
    ]);
    expect(memoryQueryKeys.proposals("project-1", "pending")).toEqual([
      "memory",
      "proposals",
      "project-1",
      "pending",
    ]);
  });

  it("fetches workspace summary from the v2 endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          project: { id: "project-1", title: "Story" },
          runtime: { read_only: true },
          next_step: { code: "configure_ai", label: "Настроить AI" },
          memory_counts: { total: 0 },
          pending_memory_items: [],
          pending_proposals: [],
          active_story_lines: [],
          planned_chapter: null,
          latest_chapter: null,
          warnings: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchProjectWorkspaceSummary("project-1");

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-1/workspace-summary", {
      headers: { "Content-Type": "application/json" },
    });
  });

  it("adds memory filters to the list request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchMemoryItems("project-1", {
      type: "character",
      status: "proposed",
      search: " Courier ",
      requires_confirmation: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project-1/memory?type=character&status=proposed&search=Courier&requires_confirmation=true",
      { headers: { "Content-Type": "application/json" } },
    );
  });

  it("posts memory state transitions and proposal decisions", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await updateMemoryItemStatus("project-1", "item-1", "canon");
    await acceptMemoryProposal("project-1", "proposal-1", {
      target_status: "canon",
      suggested_payload: { title: "Canon fact" },
    });
    await checkMemoryConflicts("project-1", { content: "New claim" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/projects/project-1/memory/item-1/status",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ status: "canon" }) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/projects/project-1/memory-proposals/proposal-1/accept",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/projects/project-1/memory/check-conflicts",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ content: "New claim" }) }),
    );
  });
});
