import type { HealthResponse } from "../types/health";

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health");
  if (!response.ok) {
    throw new Error(`Health request failed with status ${response.status}`);
  }
  return response.json() as Promise<HealthResponse>;
}

export function getHealthLabel(health?: HealthResponse, error?: string): string {
  if (error) {
    return "Backend недоступен";
  }
  if (!health) {
    return "Проверка...";
  }
  if (!health.database_exists) {
    return "Backend работает, база еще не создана";
  }
  return "Backend и база готовы";
}

