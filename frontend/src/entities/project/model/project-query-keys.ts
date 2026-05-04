export const projectQueryKeys = {
  all: ["projects"] as const,
  lists: () => [...projectQueryKeys.all, "list"] as const,
  list: () => [...projectQueryKeys.lists()] as const,
  workspace: (projectId: string) => [...projectQueryKeys.all, "workspace", projectId] as const,
  chapterEditor: (projectId: string) =>
    [...projectQueryKeys.all, "chapter-editor", projectId] as const,
};
