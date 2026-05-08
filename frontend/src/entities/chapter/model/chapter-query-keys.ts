export const chapterQueryKeys = {
  all: ["chapters"] as const,
  list: (projectId: string) => [...chapterQueryKeys.all, "list", projectId] as const,
  detail: (projectId: string, chapterId: string) =>
    [...chapterQueryKeys.all, "detail", projectId, chapterId] as const,
};
