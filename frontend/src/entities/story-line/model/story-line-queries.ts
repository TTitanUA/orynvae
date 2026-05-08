import { queryOptions } from "@tanstack/react-query";

import { fetchStoryLine, fetchStoryLineProgress, fetchStoryLines } from "../api/story-line-api";
import { storyLineQueryKeys } from "./story-line-query-keys";
import type { StoryLineFilters } from "./types";

export const storyLineQueries = {
  list: (projectId: string, filters?: StoryLineFilters) =>
    queryOptions({
      queryKey: storyLineQueryKeys.list(projectId, filters),
      queryFn: () => fetchStoryLines(projectId, filters),
      enabled: Boolean(projectId),
    }),
  detail: (projectId: string, lineId: string | null) =>
    queryOptions({
      queryKey: storyLineQueryKeys.detail(projectId, lineId || ""),
      queryFn: () => fetchStoryLine(projectId, lineId || ""),
      enabled: Boolean(projectId && lineId),
    }),
  progress: (projectId: string, lineId: string | null) =>
    queryOptions({
      queryKey: storyLineQueryKeys.progress(projectId, lineId || ""),
      queryFn: () => fetchStoryLineProgress(projectId, lineId || ""),
      enabled: Boolean(projectId && lineId),
    }),
};
