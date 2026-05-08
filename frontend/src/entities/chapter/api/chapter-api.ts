import { requestJson } from "../../../shared/api";
import type {
  Chapter,
  ChapterCreatePayload,
  ChapterPreparePayload,
  ChapterPrepareResult,
  ChapterUpdatePayload,
} from "../model/types";

export async function fetchChapters(projectId: string): Promise<Chapter[]> {
  return requestJson<Chapter[]>(`/api/projects/${projectId}/chapters`);
}

export async function createChapter(
  projectId: string,
  payload: ChapterCreatePayload,
): Promise<Chapter> {
  return requestJson<Chapter>(`/api/projects/${projectId}/chapters`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchChapter(projectId: string, chapterId: string): Promise<Chapter> {
  return requestJson<Chapter>(`/api/projects/${projectId}/chapters/${chapterId}`);
}

export async function updateChapter(
  projectId: string,
  chapterId: string,
  payload: ChapterUpdatePayload,
): Promise<Chapter> {
  return requestJson<Chapter>(`/api/projects/${projectId}/chapters/${chapterId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function prepareChapterSession(
  projectId: string,
  chapterId: string,
  payload: ChapterPreparePayload,
): Promise<ChapterPrepareResult> {
  return requestJson<ChapterPrepareResult>(
    `/api/projects/${projectId}/chapters/${chapterId}/session/prepare`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}
