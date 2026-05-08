import { mutationOptions } from "@tanstack/react-query";

import { createChapter, prepareChapterSession, updateChapter } from "../api/chapter-api";
import type { ChapterCreatePayload, ChapterPreparePayload, ChapterUpdatePayload } from "./types";

export const chapterMutations = {
  create: (projectId: string) =>
    mutationOptions({
      mutationKey: ["chapters", projectId, "create"] as const,
      mutationFn: (payload: ChapterCreatePayload) => createChapter(projectId, payload),
    }),
  update: (projectId: string, chapterId: string) =>
    mutationOptions({
      mutationKey: ["chapters", projectId, chapterId, "update"] as const,
      mutationFn: (payload: ChapterUpdatePayload) => updateChapter(projectId, chapterId, payload),
    }),
  prepare: (projectId: string, chapterId: string) =>
    mutationOptions({
      mutationKey: ["chapters", projectId, chapterId, "prepare"] as const,
      mutationFn: (payload: ChapterPreparePayload) =>
        prepareChapterSession(projectId, chapterId, payload),
    }),
};
