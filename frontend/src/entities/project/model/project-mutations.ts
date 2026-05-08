import { mutationOptions } from "@tanstack/react-query";

import {
  analyzeStartStory,
  analyzeProjectSetup,
  confirmStartStory,
  createProjectFromSetup,
  refineStartStory,
  requestContinuityCheck,
  updateChapterEditor,
  updateProject,
  updateProjectWorkspace,
} from "../api/project-api";
import type {
  ChapterEditorPayload,
  ContinuityCheckPayload,
  ProjectSetupAnalysisPayload,
  ProjectSetupCreatePayload,
  ProjectUpdatePayload,
  ProjectWorkspacePayload,
  StartStoryAnalyzePayload,
  StartStoryConfirmPayload,
  StartStoryRefinePayload,
} from "./types";

export const projectMutations = {
  analyzeStartStory: () =>
    mutationOptions({
      mutationKey: ["projects", "start", "analyze"] as const,
      mutationFn: (payload: StartStoryAnalyzePayload) => analyzeStartStory(payload),
    }),
  confirmStartStory: () =>
    mutationOptions({
      mutationKey: ["projects", "start", "confirm"] as const,
      mutationFn: (payload: StartStoryConfirmPayload) => confirmStartStory(payload),
    }),
  refineStartStory: () =>
    mutationOptions({
      mutationKey: ["projects", "start", "refine"] as const,
      mutationFn: (payload: StartStoryRefinePayload) => refineStartStory(payload),
    }),
  analyzeSetup: () =>
    mutationOptions({
      mutationKey: ["project-setup", "analyze"] as const,
      mutationFn: (payload: ProjectSetupAnalysisPayload) => analyzeProjectSetup(payload),
    }),
  createFromSetup: () =>
    mutationOptions({
      mutationKey: ["project-setup", "create"] as const,
      mutationFn: (payload: ProjectSetupCreatePayload) => createProjectFromSetup(payload),
    }),
  update: (projectId: string) =>
    mutationOptions({
      mutationKey: ["projects", "detail", projectId, "update"] as const,
      mutationFn: (payload: ProjectUpdatePayload) => updateProject(projectId, payload),
    }),
  updateWorkspace: (projectId: string) =>
    mutationOptions({
      mutationKey: ["projects", "workspace", projectId, "update"] as const,
      mutationFn: (payload: ProjectWorkspacePayload) => updateProjectWorkspace(projectId, payload),
    }),
  updateChapterEditor: (projectId: string) =>
    mutationOptions({
      mutationKey: ["projects", "chapter-editor", projectId, "update"] as const,
      mutationFn: (payload: ChapterEditorPayload) => updateChapterEditor(projectId, payload),
    }),
  continuityCheck: (projectId: string) =>
    mutationOptions({
      mutationKey: ["projects", "canon", projectId, "continuity-check"] as const,
      mutationFn: (payload: ContinuityCheckPayload) => requestContinuityCheck(projectId, payload),
    }),
};
