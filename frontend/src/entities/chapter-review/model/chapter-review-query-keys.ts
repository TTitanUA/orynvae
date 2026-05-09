export const chapterReviewQueryKeys = {
  all: ["chapter-reviews"] as const,
  detail: (projectId: string, chapterId: string) =>
    [...chapterReviewQueryKeys.all, "detail", projectId, chapterId] as const,
};
