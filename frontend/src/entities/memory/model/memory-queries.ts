import { queryOptions } from "@tanstack/react-query";

import {
  fetchMemoryItems,
  fetchMemoryProposals,
  fetchProjectWorkspaceSummary,
} from "../api/memory-api";
import { memoryQueryKeys } from "./memory-query-keys";
import type { MemoryFilters, MemoryProposalStatus } from "./types";

export const memoryQueries = {
  workspaceSummary: (projectId: string) =>
    queryOptions({
      queryKey: memoryQueryKeys.workspaceSummary(projectId),
      queryFn: () => fetchProjectWorkspaceSummary(projectId),
      enabled: Boolean(projectId),
    }),
  list: (projectId: string, filters?: MemoryFilters) =>
    queryOptions({
      queryKey: memoryQueryKeys.list(projectId, filters),
      queryFn: () => fetchMemoryItems(projectId, filters),
      enabled: Boolean(projectId),
    }),
  proposals: (projectId: string, status?: MemoryProposalStatus) =>
    queryOptions({
      queryKey: memoryQueryKeys.proposals(projectId, status),
      queryFn: () => fetchMemoryProposals(projectId, status),
      enabled: Boolean(projectId),
    }),
};
