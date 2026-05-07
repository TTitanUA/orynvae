import { queryOptions } from "@tanstack/react-query";

import {
  fetchChapterEditor,
  fetchProject,
  fetchProjects,
  fetchProjectWorkspace,
} from "../api/project-api";
import { projectQueryKeys } from "./project-query-keys";

export const projectQueries = {
  list: () =>
    queryOptions({
      queryKey: projectQueryKeys.list(),
      queryFn: fetchProjects,
    }),
  detail: (projectId: string) =>
    queryOptions({
      queryKey: projectQueryKeys.detail(projectId),
      queryFn: () => fetchProject(projectId),
      enabled: Boolean(projectId),
    }),
  workspace: (projectId: string) =>
    queryOptions({
      queryKey: projectQueryKeys.workspace(projectId),
      queryFn: () => fetchProjectWorkspace(projectId),
      enabled: Boolean(projectId),
    }),
  chapterEditor: (projectId: string) =>
    queryOptions({
      queryKey: projectQueryKeys.chapterEditor(projectId),
      queryFn: () => fetchChapterEditor(projectId),
      enabled: Boolean(projectId),
    }),
};
