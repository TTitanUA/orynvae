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
