import { requestJson } from "../../../shared/api";
import type { HealthResponse } from "../model/types";

export async function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>("/api/health");
}
