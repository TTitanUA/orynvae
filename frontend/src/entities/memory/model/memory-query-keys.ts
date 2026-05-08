import type { MemoryFilters, MemoryProposalStatus } from "./types";

export const memoryQueryKeys = {
  all: ["memory"] as const,
  workspaceSummary: (projectId: string) =>
    [...memoryQueryKeys.all, "workspace-summary", projectId] as const,
  list: (projectId: string, filters?: MemoryFilters) =>
    [...memoryQueryKeys.all, "list", projectId, filters || {}] as const,
  proposals: (projectId: string, status?: MemoryProposalStatus) =>
    [...memoryQueryKeys.all, "proposals", projectId, status || "all"] as const,
};
