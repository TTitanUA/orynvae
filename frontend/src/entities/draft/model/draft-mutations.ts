import { mutationOptions } from "@tanstack/react-query";

import { assembleDraft, assistDraft, updateDraft } from "../api/draft-api";
import type { DraftAssemblyPayload, DraftAssistPayload, DraftUpdatePayload } from "./types";

export const draftMutations = {
  assemble: (sessionId: string) =>
    mutationOptions({
      mutationKey: ["drafts", sessionId, "assemble"] as const,
      mutationFn: (payload: DraftAssemblyPayload) => assembleDraft(sessionId, payload),
    }),
  update: (projectId: string, chapterId: string) =>
    mutationOptions({
      mutationKey: ["drafts", projectId, chapterId, "update"] as const,
      mutationFn: (payload: DraftUpdatePayload) => updateDraft(projectId, chapterId, payload),
    }),
  assist: (projectId: string, chapterId: string) =>
    mutationOptions({
      mutationKey: ["drafts", projectId, chapterId, "assist"] as const,
      mutationFn: (payload: DraftAssistPayload) => assistDraft(projectId, chapterId, payload),
    }),
};
