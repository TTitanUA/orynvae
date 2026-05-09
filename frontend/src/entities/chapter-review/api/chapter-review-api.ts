import { requestJson } from "../../../shared/api";
import type {
  ChapterReviewApplyPayload,
  ChapterReviewGeneratePayload,
  ChapterReviewResponse,
} from "../model/types";

export async function fetchChapterReview(
  projectId: string,
  chapterId: string,
): Promise<ChapterReviewResponse> {
  return requestJson<ChapterReviewResponse>(`/api/projects/${projectId}/chapters/${chapterId}/review`);
}

export async function generateChapterReview(
  projectId: string,
  chapterId: string,
  payload: ChapterReviewGeneratePayload,
): Promise<ChapterReviewResponse> {
  return requestJson<ChapterReviewResponse>(`/api/projects/${projectId}/chapters/${chapterId}/review`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function applyChapterReview(
  projectId: string,
  chapterId: string,
  payload: ChapterReviewApplyPayload,
): Promise<ChapterReviewResponse> {
  return requestJson<ChapterReviewResponse>(
    `/api/projects/${projectId}/chapters/${chapterId}/review/apply`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}
