import {
  fetchDebugLogStatus,
  postDebugLogs,
  type DebugLogCategory,
  type DebugLogEntry,
} from "./entities/debug-log";

let initialized = false;
let enabled = false;
let originalFetch: typeof fetch | undefined;

const SECRET_KEY_PARTS = ["authorization", "api_key", "apikey", "password", "secret", "token", "cookie"];
const MAX_STRING_LENGTH = 12_000;
const DEBUG_STATUS_TIMEOUT_MS = 1500;

export async function initializeFrontendDebugLogging(): Promise<void> {
  if (initialized || typeof window === "undefined") {
    return;
  }
  initialized = true;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), DEBUG_STATUS_TIMEOUT_MS);
  let status;
  try {
    status = await fetchDebugLogStatus(controller.signal);
  } catch {
    return;
  } finally {
    window.clearTimeout(timeout);
  }

  enabled = status.enabled;
  if (!enabled) {
    return;
  }

  installFetchLogger();
  installSystemListeners();
  emitFrontendDebugLog("system", "frontend.debug.enabled", {
    location: window.location.href,
    user_agent: window.navigator.userAgent,
  });
}

export function isFrontendDebugLoggingEnabled(): boolean {
  return enabled;
}

export function emitFrontendDebugLog(
  category: DebugLogCategory,
  operation: string,
  payload: Record<string, unknown> = {},
): void {
  if (!enabled) {
    return;
  }

  const entry: DebugLogEntry = {
    timestamp: readableTimestamp(),
    module: "frontend",
    category,
    operation,
    payload: sanitizeDebugPayload(payload) as Record<string, unknown>,
  };
  void postDebugLogs([entry]).catch(() => undefined);
}

export function resetFrontendDebugLoggingForTests(): void {
  if (originalFetch) {
    window.fetch = originalFetch;
  }
  initialized = false;
  enabled = false;
  originalFetch = undefined;
}

function installFetchLogger(): void {
  if (originalFetch || typeof window.fetch !== "function") {
    return;
  }

  originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = requestUrl(input);
    if (isDebugLogEndpoint(url)) {
      return originalFetch!(input, init);
    }

    const started = performance.now();
    const method = requestMethod(input, init);
    const category = fetchCategory(url);
    const operationPrefix = category === "LLM" ? "fetch.llm" : "fetch.http";
    emitFrontendDebugLog(category, `${operationPrefix}.start`, {
      method,
      url,
      ...requestPayload(init),
    });

    try {
      const response = await originalFetch!(input, init);
      emitFrontendDebugLog(category, `${operationPrefix}.end`, {
        method,
        url,
        status_code: response.status,
        ok: response.ok,
        duration_ms: Math.round(performance.now() - started),
      });
      return response;
    } catch (error) {
      emitFrontendDebugLog(category, `${operationPrefix}.error`, {
        method,
        url,
        duration_ms: Math.round(performance.now() - started),
        error: errorPayload(error),
      });
      throw error;
    }
  };
}

function installSystemListeners(): void {
  window.addEventListener("error", (event) => {
    emitFrontendDebugLog("system", "window.error", {
      message: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno,
      error: errorPayload(event.error),
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    emitFrontendDebugLog("system", "window.unhandledrejection", {
      reason: errorPayload(event.reason),
    });
  });

  document.addEventListener("visibilitychange", () => {
    emitFrontendDebugLog("system", "document.visibilitychange", {
      visibility_state: document.visibilityState,
    });
  });
}

function fetchCategory(url: string): DebugLogCategory {
  const path = urlPath(url);
  if (
    path.startsWith("/api/ai-actions/") ||
    path.endsWith("/chapter-editor/assist") ||
    path.endsWith("/canon/check") ||
    path.endsWith("/projects/setup/analyze") ||
    /\/api\/providers\/[^/]+\/(chat|test|models\/refresh)$/.test(path)
  ) {
    return "LLM";
  }
  return "http";
}

function isDebugLogEndpoint(url: string): boolean {
  const path = urlPath(url);
  return path === "/api/debug/logs" || path.startsWith("/api/debug/logs/");
}

function urlPath(url: string): string {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return url;
  }
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) {
    return init.method.toUpperCase();
  }
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.method.toUpperCase();
  }
  return "GET";
}

function requestBody(init?: RequestInit): string | undefined {
  const body = init?.body;
  if (!body) {
    return undefined;
  }
  if (typeof body === "string") {
    return body;
  }
  if (body instanceof URLSearchParams) {
    return body.toString();
  }
  return `[${body.constructor.name}]`;
}

function requestPayload(init?: RequestInit): Record<string, unknown> {
  const body = requestBody(init);
  return body === undefined ? {} : { body };
}

function readableTimestamp(): string {
  const now = new Date();
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  const offsetMinutes = -now.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? "+" : "-";
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
  const offsetRemainder = Math.abs(offsetMinutes) % 60;

  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.` +
    `${pad(now.getMilliseconds(), 3)} ${offsetSign}${pad(offsetHours)}${pad(offsetRemainder)}`
  );
}

function errorPayload(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { value: sanitizeDebugPayload(error) };
}

function sanitizeDebugPayload(value: unknown, key?: string, depth = 0): unknown {
  if (key && SECRET_KEY_PARTS.some((part) => key.toLowerCase().includes(part))) {
    return "[redacted]";
  }
  if (depth > 8) {
    return String(value);
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "undefined") {
    return undefined;
  }
  if (typeof value === "string") {
    if (value.length <= MAX_STRING_LENGTH) {
      return value;
    }
    return `${value.slice(0, MAX_STRING_LENGTH)}...[truncated ${value.length - MAX_STRING_LENGTH} chars]`;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDebugPayload(item, undefined, depth + 1));
  }
  if (typeof value === "object" && value) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([itemKey, itemValue]) => [
        itemKey,
        sanitizeDebugPayload(itemValue, itemKey, depth + 1),
      ]),
    );
  }
  return String(value);
}
