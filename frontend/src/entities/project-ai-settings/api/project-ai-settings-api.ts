import { requestJson } from "../../../shared/api";
import type { ProjectAiSettings, ProjectAiSettingsPatch } from "../model/types";

export async function fetchProjectAiSettings(projectId: string): Promise<ProjectAiSettings> {
  return requestJson<ProjectAiSettings>(`/api/projects/${projectId}/ai-settings`);
}

export async function updateProjectAiSettings(
  projectId: string,
  payload: ProjectAiSettingsPatch,
): Promise<ProjectAiSettings> {
  return requestJson<ProjectAiSettings>(`/api/projects/${projectId}/ai-settings`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
