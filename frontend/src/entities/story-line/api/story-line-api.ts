import { requestJson } from "../../../shared/api";
import type {
  StoryLine,
  StoryLineCreatePayload,
  StoryLineFilters,
  StoryLineProgressResult,
  StoryLineStatus,
  StoryLineSuggestPayload,
  StoryLineSuggestResult,
  StoryLineUpdatePayload,
} from "../model/types";

function storyLineQueryString(filters?: StoryLineFilters): string {
  const params = new URLSearchParams();
  if (filters?.type) {
    params.set("type", filters.type);
  }
  if (filters?.status) {
    params.set("status", filters.status);
  }
  if (filters?.search?.trim()) {
    params.set("search", filters.search.trim());
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function fetchStoryLines(
  projectId: string,
  filters?: StoryLineFilters,
): Promise<StoryLine[]> {
  return requestJson<StoryLine[]>(
    `/api/projects/${projectId}/story-lines${storyLineQueryString(filters)}`,
  );
}

export async function fetchStoryLine(projectId: string, lineId: string): Promise<StoryLine> {
  return requestJson<StoryLine>(`/api/projects/${projectId}/story-lines/${lineId}`);
}

export async function createStoryLine(
  projectId: string,
  payload: StoryLineCreatePayload,
): Promise<StoryLine> {
  return requestJson<StoryLine>(`/api/projects/${projectId}/story-lines`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateStoryLine(
  projectId: string,
  lineId: string,
  payload: StoryLineUpdatePayload,
): Promise<StoryLine> {
  return requestJson<StoryLine>(`/api/projects/${projectId}/story-lines/${lineId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function updateStoryLineStatus(
  projectId: string,
  lineId: string,
  status: StoryLineStatus,
): Promise<StoryLine> {
  return requestJson<StoryLine>(`/api/projects/${projectId}/story-lines/${lineId}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

export async function fetchStoryLineProgress(
  projectId: string,
  lineId: string,
): Promise<StoryLineProgressResult> {
  return requestJson<StoryLineProgressResult>(
    `/api/projects/${projectId}/story-lines/${lineId}/progress`,
  );
}

export async function suggestStoryLines(
  projectId: string,
  payload: StoryLineSuggestPayload,
): Promise<StoryLineSuggestResult> {
  return requestJson<StoryLineSuggestResult>(`/api/projects/${projectId}/story-lines/suggest`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
