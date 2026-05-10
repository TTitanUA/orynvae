export const projectAiSettingsQueryKeys = {
  all: ["project-ai-settings"] as const,
  detail: (projectId: string) => [...projectAiSettingsQueryKeys.all, projectId] as const,
};
