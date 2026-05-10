import { mutationOptions } from "@tanstack/react-query";

import { updateProjectAiSettings } from "../api/project-ai-settings-api";
import type { ProjectAiSettingsPatch } from "./types";

export const projectAiSettingsMutations = {
  update: (projectId: string) =>
    mutationOptions({
      mutationFn: (payload: ProjectAiSettingsPatch) => updateProjectAiSettings(projectId, payload),
    }),
};
