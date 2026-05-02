import type {
  ChapterAiPayload,
  ChapterEditorPayload,
  ChapterEditorState,
  Project,
  ProjectSetupAnalysis,
  ProjectSetupAnalysisPayload,
  ProjectSetupCreatePayload,
  ProjectWorkspace,
  ProjectWorkspacePayload,
} from "../types/projects";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    const detail = body && typeof body.detail === "string" ? body.detail : response.statusText;
    throw new Error(detail || `Request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

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

export async function fetchProjectWorkspace(projectId: string): Promise<ProjectWorkspace> {
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
    const body = await response.json().catch(() => undefined);
    const detail = body && typeof body.detail === "string" ? body.detail : response.statusText;
    throw new Error(detail || `Request failed with status ${response.status}`);
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

export function projectStatusLabel(project: Project): string {
  if (project.archived_at) {
    return "Архив";
  }
  return project.status === "active" ? "Активен" : project.status;
}
