import { mutationOptions } from "@tanstack/react-query";

import {
  acceptMemoryProposal,
  checkMemoryConflicts,
  createMemoryItem,
  rejectMemoryProposal,
  updateMemoryItem,
  updateMemoryItemStatus,
} from "../api/memory-api";
import type {
  MemoryConflictCheckPayload,
  MemoryItemCreatePayload,
  MemoryItemStatus,
  MemoryItemUpdatePayload,
  MemoryProposalAcceptPayload,
  MemoryProposalRejectPayload,
} from "./types";

export const memoryMutations = {
  createItem: (projectId: string) =>
    mutationOptions({
      mutationKey: ["memory", projectId, "create"] as const,
      mutationFn: (payload: MemoryItemCreatePayload) => createMemoryItem(projectId, payload),
    }),
  updateItem: (projectId: string, itemId: string) =>
    mutationOptions({
      mutationKey: ["memory", projectId, itemId, "update"] as const,
      mutationFn: (payload: MemoryItemUpdatePayload) => updateMemoryItem(projectId, itemId, payload),
    }),
  updateStatus: (projectId: string, itemId: string) =>
    mutationOptions({
      mutationKey: ["memory", projectId, itemId, "status"] as const,
      mutationFn: (status: MemoryItemStatus) => updateMemoryItemStatus(projectId, itemId, status),
    }),
  acceptProposal: (projectId: string, proposalId: string) =>
    mutationOptions({
      mutationKey: ["memory", projectId, "proposal", proposalId, "accept"] as const,
      mutationFn: (payload: MemoryProposalAcceptPayload) =>
        acceptMemoryProposal(projectId, proposalId, payload),
    }),
  rejectProposal: (projectId: string, proposalId: string) =>
    mutationOptions({
      mutationKey: ["memory", projectId, "proposal", proposalId, "reject"] as const,
      mutationFn: (payload: MemoryProposalRejectPayload) =>
        rejectMemoryProposal(projectId, proposalId, payload),
    }),
  checkConflicts: (projectId: string) =>
    mutationOptions({
      mutationKey: ["memory", projectId, "check-conflicts"] as const,
      mutationFn: (payload: MemoryConflictCheckPayload) => checkMemoryConflicts(projectId, payload),
    }),
};
