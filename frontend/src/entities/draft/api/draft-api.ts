import { requestJson } from "../../../shared/api";
import type {
  DraftAssemblyPayload,
  DraftAssemblyResponse,
  DraftAssistPayload,
  DraftAssistResponse,
  DraftUpdatePayload,
  DraftUpdateResponse,
  DraftVersion,
} from "../model/types";

export async function fetchDraftVersions(projectId: string, chapterId: string): Promise<DraftVersion[]> {
  return requestJson<DraftVersion[]>(`/api/projects/${projectId}/chapters/${chapterId}/draft-versions`);
}

export async function assembleDraft(
  sessionId: string,
  payload: DraftAssemblyPayload,
): Promise<DraftAssemblyResponse> {
  return requestJson<DraftAssemblyResponse>(`/api/sessions/${sessionId}/assemble-draft`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateDraft(
  projectId: string,
  chapterId: string,
  payload: DraftUpdatePayload,
): Promise<DraftUpdateResponse> {
  return requestJson<DraftUpdateResponse>(`/api/projects/${projectId}/chapters/${chapterId}/draft`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function assistDraft(
  projectId: string,
  chapterId: string,
  payload: DraftAssistPayload,
): Promise<DraftAssistResponse> {
  return requestJson<DraftAssistResponse>(`/api/projects/${projectId}/chapters/${chapterId}/draft/assist`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
