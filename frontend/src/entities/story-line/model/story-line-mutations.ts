import { mutationOptions } from "@tanstack/react-query";

import {
  createStoryLine,
  suggestStoryLines,
  updateStoryLine,
  updateStoryLineStatus,
} from "../api/story-line-api";
import type {
  StoryLineCreatePayload,
  StoryLineStatus,
  StoryLineSuggestPayload,
  StoryLineUpdatePayload,
} from "./types";

export const storyLineMutations = {
  create: (projectId: string) =>
    mutationOptions({
      mutationKey: ["story-lines", projectId, "create"] as const,
      mutationFn: (payload: StoryLineCreatePayload) => createStoryLine(projectId, payload),
    }),
  update: (projectId: string, lineId: string) =>
    mutationOptions({
      mutationKey: ["story-lines", projectId, lineId, "update"] as const,
      mutationFn: (payload: StoryLineUpdatePayload) => updateStoryLine(projectId, lineId, payload),
    }),
  updateStatus: (projectId: string, lineId: string) =>
    mutationOptions({
      mutationKey: ["story-lines", projectId, lineId, "status"] as const,
      mutationFn: (status: StoryLineStatus) => updateStoryLineStatus(projectId, lineId, status),
    }),
  suggest: (projectId: string) =>
    mutationOptions({
      mutationKey: ["story-lines", projectId, "suggest"] as const,
      mutationFn: (payload: StoryLineSuggestPayload) => suggestStoryLines(projectId, payload),
    }),
};
