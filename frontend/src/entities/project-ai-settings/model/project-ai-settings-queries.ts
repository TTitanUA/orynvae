import { queryOptions } from "@tanstack/react-query";

import { fetchProjectAiSettings } from "../api/project-ai-settings-api";
import { projectAiSettingsQueryKeys } from "./project-ai-settings-query-keys";

export const projectAiSettingsQueries = {
  detail: (projectId: string) =>
    queryOptions({
      queryKey: projectAiSettingsQueryKeys.detail(projectId),
      queryFn: () => fetchProjectAiSettings(projectId),
      enabled: Boolean(projectId),
    }),
};
