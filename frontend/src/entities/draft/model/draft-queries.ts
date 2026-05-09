import { queryOptions } from "@tanstack/react-query";

import { fetchDraftVersions } from "../api/draft-api";
import { draftQueryKeys } from "./draft-query-keys";

export const draftQueries = {
  versions: (projectId: string, chapterId: string | null) =>
    queryOptions({
      queryKey: draftQueryKeys.versions(projectId, chapterId || ""),
      queryFn: () => fetchDraftVersions(projectId, chapterId || ""),
      enabled: Boolean(projectId && chapterId),
    }),
};
