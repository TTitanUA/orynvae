import type { Project } from "./types";

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
