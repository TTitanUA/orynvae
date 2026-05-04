import type {
  ChapterAiPayload,
  ChapterEditorPayload,
  ChapterEditorState,
  ContinuityCheck,
  ContinuityCheckPayload,
  Project,
  ProjectSetupAnalysis,
  ProjectSetupAnalysisPayload,
  ProjectSetupCreatePayload,
  ProjectWorkspace,
  ProjectWorkspacePayload,
} from "../model/types";
import { apiErrorFromResponse, requestJson } from "../../../shared/api";

export { ApiError } from "../../../shared/api";

export async function fetchProjects(): Promise<Project[]> {
  return requestJson<Project[]>("/api/projects");
}

export async function analyzeProjectSetup(
  payload: ProjectSetupAnalysisPayload,
): Promise<ProjectSetupAnalysis> {
  return requestJson<ProjectSetupAnalysis>("/api/projects/setup/analyze", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createProjectFromSetup(
  payload: ProjectSetupCreatePayload,
): Promise<Project> {
  return requestJson<Project>("/api/projects/setup", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchProjectWorkspace(
  projectId: string,
): Promise<ProjectWorkspace> {
  return requestJson<ProjectWorkspace>(`/api/projects/${projectId}/workspace`);
}

export async function updateProjectWorkspace(
  projectId: string,
  payload: ProjectWorkspacePayload,
): Promise<ProjectWorkspace> {
  return requestJson<ProjectWorkspace>(`/api/projects/${projectId}/workspace`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function fetchChapterEditor(projectId: string): Promise<ChapterEditorState> {
  return requestJson<ChapterEditorState>(`/api/projects/${projectId}/chapter-editor`);
}

export async function updateChapterEditor(
  projectId: string,
  payload: ChapterEditorPayload,
): Promise<ChapterEditorState> {
  return requestJson<ChapterEditorState>(`/api/projects/${projectId}/chapter-editor`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function requestChapterAi(
  projectId: string,
  payload: ChapterAiPayload,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(`/api/projects/${projectId}/chapter-editor/assist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }

  if (!response.body) {
    const text = await response.text();
    onChunk(text);
    return text;
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    const chunk = decoder.decode(value, { stream: true });
    text += chunk;
    onChunk(chunk);
  }
  const tail = decoder.decode();
  if (tail) {
    text += tail;
    onChunk(tail);
  }
  return text;
}

export async function requestContinuityCheck(
  projectId: string,
  payload: ContinuityCheckPayload,
): Promise<ContinuityCheck> {
  return requestJson<ContinuityCheck>(`/api/projects/${projectId}/canon/check`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
