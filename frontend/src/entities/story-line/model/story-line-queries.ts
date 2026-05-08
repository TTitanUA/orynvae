import { queryOptions } from "@tanstack/react-query";

import { fetchStoryLineProgress, fetchStoryLines } from "../api/story-line-api";
import { storyLineQueryKeys } from "./story-line-query-keys";
import type { StoryLineFilters } from "./types";

export const storyLineQueries = {
  list: (projectId: string, filters?: StoryLineFilters) =>
    queryOptions({
      queryKey: storyLineQueryKeys.list(projectId, filters),
      queryFn: () => fetchStoryLines(projectId, filters),
      enabled: Boolean(projectId),
    }),
  progress: (projectId: string, lineId: string | null) =>
    queryOptions({
      queryKey: storyLineQueryKeys.progress(projectId, lineId || ""),
      queryFn: () => fetchStoryLineProgress(projectId, lineId || ""),
      enabled: Boolean(projectId && lineId),
    }),
};
