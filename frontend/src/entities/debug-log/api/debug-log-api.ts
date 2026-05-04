import { requestJson, requestVoid } from "../../../shared/api";
import type { DebugLogEntry, DebugLogStatus } from "../model/types";

export async function fetchDebugLogStatus(signal?: AbortSignal): Promise<DebugLogStatus> {
  return requestJson<DebugLogStatus>("/api/debug/logs", { cache: "no-store", signal });
}

export async function postDebugLogs(entries: DebugLogEntry[]): Promise<void> {
  if (!entries.length) {
    return;
  }

  return requestVoid("/api/debug/logs", {
    method: "POST",
    body: JSON.stringify({ entries }),
  });
}
