import { requestJson } from "../../../shared/api";
import type { RuntimeStatus } from "../model/types";

export async function fetchRuntimeStatus(): Promise<RuntimeStatus> {
  return requestJson<RuntimeStatus>("/api/runtime/status", { cache: "no-store" });
}
