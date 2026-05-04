export type DebugLogCategory = "system" | "http" | "LLM";

export interface DebugLogStatus {
  enabled: boolean;
}

export interface DebugLogEntry {
  timestamp: string;
  module: "frontend";
  category: DebugLogCategory;
  operation: string;
  payload: Record<string, unknown>;
}

export async function fetchDebugLogStatus(signal?: AbortSignal): Promise<DebugLogStatus> {
  const response = await fetch("/api/debug/logs", { cache: "no-store", signal });
  if (!response.ok) {
    throw new Error(`Debug log status request failed with status ${response.status}`);
  }
  return response.json() as Promise<DebugLogStatus>;
}

export async function postDebugLogs(entries: DebugLogEntry[]): Promise<void> {
  if (!entries.length) {
    return;
  }

  const response = await fetch("/api/debug/logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries }),
  });
  if (!response.ok) {
    throw new Error(`Debug log post failed with status ${response.status}`);
  }
}
