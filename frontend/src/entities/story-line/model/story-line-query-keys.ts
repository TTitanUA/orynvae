import type { StoryLineFilters } from "./types";

export const storyLineQueryKeys = {
  all: ["story-lines"] as const,
  list: (projectId: string, filters?: StoryLineFilters) =>
    [...storyLineQueryKeys.all, "list", projectId, filters || {}] as const,
  progress: (projectId: string, lineId: string) =>
    [...storyLineQueryKeys.all, "progress", projectId, lineId] as const,
};
