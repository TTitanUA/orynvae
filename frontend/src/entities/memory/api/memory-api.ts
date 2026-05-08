import { requestJson } from "../../../shared/api";
import type {
  MemoryConflictCheckPayload,
  MemoryConflictCheckResult,
  MemoryFilters,
  MemoryItem,
  MemoryItemCreatePayload,
  MemoryItemStatus,
  MemoryItemUpdatePayload,
  MemoryProposal,
  MemoryProposalAcceptPayload,
  MemoryProposalDecision,
  MemoryProposalRejectPayload,
  MemoryProposalStatus,
  ProjectWorkspaceSummary,
} from "../model/types";

function memoryQueryString(filters?: MemoryFilters): string {
  const params = new URLSearchParams();
  if (filters?.type) {
    params.set("type", filters.type);
  }
  if (filters?.status) {
    params.set("status", filters.status);
  }
  if (filters?.search?.trim()) {
    params.set("search", filters.search.trim());
  }
  if (filters?.requires_confirmation !== undefined) {
    params.set("requires_confirmation", String(filters.requires_confirmation));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function fetchProjectWorkspaceSummary(
  projectId: string,
): Promise<ProjectWorkspaceSummary> {
  return requestJson<ProjectWorkspaceSummary>(`/api/projects/${projectId}/workspace-summary`);
}

export async function fetchMemoryItems(
  projectId: string,
  filters?: MemoryFilters,
): Promise<MemoryItem[]> {
  return requestJson<MemoryItem[]>(`/api/projects/${projectId}/memory${memoryQueryString(filters)}`);
}

export async function createMemoryItem(
  projectId: string,
  payload: MemoryItemCreatePayload,
): Promise<MemoryItem> {
  return requestJson<MemoryItem>(`/api/projects/${projectId}/memory`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateMemoryItem(
  projectId: string,
  itemId: string,
  payload: MemoryItemUpdatePayload,
): Promise<MemoryItem> {
  return requestJson<MemoryItem>(`/api/projects/${projectId}/memory/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function updateMemoryItemStatus(
  projectId: string,
  itemId: string,
  status: MemoryItemStatus,
): Promise<MemoryItem> {
  return requestJson<MemoryItem>(`/api/projects/${projectId}/memory/${itemId}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

export async function fetchMemoryProposals(
  projectId: string,
  status?: MemoryProposalStatus,
): Promise<MemoryProposal[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return requestJson<MemoryProposal[]>(`/api/projects/${projectId}/memory-proposals${query}`);
}

export async function acceptMemoryProposal(
  projectId: string,
  proposalId: string,
  payload: MemoryProposalAcceptPayload,
): Promise<MemoryProposalDecision> {
  return requestJson<MemoryProposalDecision>(
    `/api/projects/${projectId}/memory-proposals/${proposalId}/accept`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function rejectMemoryProposal(
  projectId: string,
  proposalId: string,
  payload: MemoryProposalRejectPayload,
): Promise<MemoryProposal> {
  return requestJson<MemoryProposal>(
    `/api/projects/${projectId}/memory-proposals/${proposalId}/reject`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function checkMemoryConflicts(
  projectId: string,
  payload: MemoryConflictCheckPayload,
): Promise<MemoryConflictCheckResult> {
  return requestJson<MemoryConflictCheckResult>(`/api/projects/${projectId}/memory/check-conflicts`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
