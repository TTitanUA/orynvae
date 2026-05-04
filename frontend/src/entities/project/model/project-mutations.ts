import { mutationOptions } from "@tanstack/react-query";

import {
  analyzeProjectSetup,
  createProjectFromSetup,
  requestContinuityCheck,
  updateChapterEditor,
  updateProjectWorkspace,
} from "../api/project-api";
import type {
  ChapterEditorPayload,
  ContinuityCheckPayload,
  ProjectSetupAnalysisPayload,
  ProjectSetupCreatePayload,
  ProjectWorkspacePayload,
} from "./types";

export const projectMutations = {
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
