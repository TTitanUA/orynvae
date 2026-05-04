import type { HealthResponse } from "./types";

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
