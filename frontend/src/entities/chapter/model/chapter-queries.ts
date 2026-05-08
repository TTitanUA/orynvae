import { queryOptions } from "@tanstack/react-query";

import { fetchChapter, fetchChapters } from "../api/chapter-api";
import { chapterQueryKeys } from "./chapter-query-keys";

export const chapterQueries = {
  list: (projectId: string) =>
    queryOptions({
      queryKey: chapterQueryKeys.list(projectId),
      queryFn: () => fetchChapters(projectId),
      enabled: Boolean(projectId),
    }),
  detail: (projectId: string, chapterId: string | null) =>
    queryOptions({
      queryKey: chapterQueryKeys.detail(projectId, chapterId || ""),
      queryFn: () => fetchChapter(projectId, chapterId || ""),
      enabled: Boolean(projectId && chapterId),
    }),
};
