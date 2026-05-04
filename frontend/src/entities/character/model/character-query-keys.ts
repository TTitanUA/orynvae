export const characterQueryKeys = {
  all: ["characters"] as const,
  lists: () => [...characterQueryKeys.all, "list"] as const,
  list: (projectId: string) => [...characterQueryKeys.lists(), projectId] as const,
  detail: (projectId: string, characterId: string) =>
    [...characterQueryKeys.all, "detail", projectId, characterId] as const,
};
