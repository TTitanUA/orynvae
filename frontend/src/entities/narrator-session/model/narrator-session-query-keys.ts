export const narratorSessionQueryKeys = {
  all: ["narrator-sessions"] as const,
  detail: (sessionId: string) => [...narratorSessionQueryKeys.all, sessionId] as const,
  turns: (sessionId: string) => [...narratorSessionQueryKeys.detail(sessionId), "turns"] as const,
  log: (sessionId: string) => [...narratorSessionQueryKeys.detail(sessionId), "log"] as const,
  keyEvents: (sessionId: string) =>
    [...narratorSessionQueryKeys.detail(sessionId), "key-events"] as const,
};
