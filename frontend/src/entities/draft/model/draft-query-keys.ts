export const draftQueryKeys = {
  all: ["drafts"] as const,
  versions: (projectId: string, chapterId: string) =>
    [...draftQueryKeys.all, "versions", projectId, chapterId] as const,
};
