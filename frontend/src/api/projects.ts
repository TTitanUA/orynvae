import type {
  Project,
  ProjectSetupAnalysis,
  ProjectSetupAnalysisPayload,
  ProjectSetupCreatePayload,
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

export function projectStatusLabel(project: Project): string {
  if (project.archived_at) {
    return "Архив";
  }
  return project.status === "active" ? "Активен" : project.status;
}

