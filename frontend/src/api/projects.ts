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
} from "../types/projects";

export type ApiFieldErrors = Record<string, string>;

type ApiValidationIssue = {
  loc?: unknown[];
  msg?: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: ApiFieldErrors;

  constructor(message: string, status: number, fieldErrors: ApiFieldErrors = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

function fieldNameFromLocation(location: unknown): string | undefined {
  if (!Array.isArray(location)) {
    return undefined;
  }

  const field = [...location]
    .reverse()
    .find((item) => typeof item === "string" && item !== "body");
  return typeof field === "string" ? field : undefined;
}

function fieldErrorsFromDetail(detail: unknown): ApiFieldErrors {
  if (!Array.isArray(detail)) {
    return {};
  }

  return detail.reduce<ApiFieldErrors>((errors, issue: ApiValidationIssue) => {
    const field = fieldNameFromLocation(issue.loc);
    if (field && typeof issue.msg === "string") {
      errors[field] = issue.msg;
    }
    return errors;
  }, {});
}

function fieldErrorsFromMessage(message: string): ApiFieldErrors {
  if (message === "Provider and model must be selected together") {
    return {
      provider_id: "Provider and model must be selected together",
      model_id: "Provider and model must be selected together",
    };
  }
  if (message === "Provider not found" || message === "Provider is disabled") {
    return { provider_id: message };
  }
  if (
    message === "Model does not belong to this provider" ||
    message === "Model is not allowed for this provider"
  ) {
    return { model_id: message };
  }
  return {};
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    const detail =
      body && typeof body === "object" && "detail" in body
        ? (body as { detail?: unknown }).detail
        : undefined;
    const detailMessage = typeof detail === "string" ? detail : undefined;
    const message = detailMessage || response.statusText || `Request failed with status ${response.status}`;
    const fieldErrors = {
      ...fieldErrorsFromDetail(detail),
      ...fieldErrorsFromMessage(message),
    };
    throw new ApiError(message, response.status, fieldErrors);
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

export async function requestContinuityCheck(
  projectId: string,
  payload: ContinuityCheckPayload,
): Promise<ContinuityCheck> {
  return requestJson<ContinuityCheck>(`/api/projects/${projectId}/canon/check`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function projectStatusLabel(project: Project): string {
  if (project.archived_at) {
    return "Архив";
  }
  return project.status === "active" ? "Активен" : project.status;
}

export function continuitySeverityLabel(severity: string): string {
  if (severity === "conflict") {
    return "Conflict";
  }
  if (severity === "warning") {
    return "Warning";
  }
  return "Info";
}
