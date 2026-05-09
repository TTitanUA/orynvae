import { mutationOptions } from "@tanstack/react-query";

import { applyChapterReview, generateChapterReview } from "../api/chapter-review-api";
import type { ChapterReviewApplyPayload, ChapterReviewGeneratePayload } from "./types";

export const chapterReviewMutations = {
  generate: (projectId: string, chapterId: string) =>
    mutationOptions({
      mutationKey: ["chapter-reviews", projectId, chapterId, "generate"] as const,
      mutationFn: (payload: ChapterReviewGeneratePayload) =>
        generateChapterReview(projectId, chapterId, payload),
    }),
  apply: (projectId: string, chapterId: string) =>
    mutationOptions({
      mutationKey: ["chapter-reviews", projectId, chapterId, "apply"] as const,
      mutationFn: (payload: ChapterReviewApplyPayload) =>
        applyChapterReview(projectId, chapterId, payload),
    }),
};
