import { queryOptions } from "@tanstack/react-query";

import { fetchChapterReview } from "../api/chapter-review-api";
import { chapterReviewQueryKeys } from "./chapter-review-query-keys";

export const chapterReviewQueries = {
  detail: (projectId: string, chapterId: string | null) =>
    queryOptions({
      queryKey: chapterReviewQueryKeys.detail(projectId, chapterId || ""),
      queryFn: () => fetchChapterReview(projectId, chapterId || ""),
      enabled: Boolean(projectId && chapterId),
      retry: false,
    }),
};
