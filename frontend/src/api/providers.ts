import type {
  Provider,
  ProviderCreatePayload,
  ProviderDefaults,
  ProviderModelRefreshResponse,
  ProviderTestResponse,
} from "../types/providers";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    const detail = body && typeof body.detail === "string" ? body.detail : response.statusText;
    throw new Error(detail || `Request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchProviderDefaults(): Promise<ProviderDefaults[]> {
  return requestJson<ProviderDefaults[]>("/api/providers/defaults");
}

export async function fetchProviders(): Promise<Provider[]> {
  return requestJson<Provider[]>("/api/providers");
}

export async function createProvider(payload: ProviderCreatePayload): Promise<Provider> {
  return requestJson<Provider>("/api/providers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function testProvider(providerId: string): Promise<ProviderTestResponse> {
  return requestJson<ProviderTestResponse>(`/api/providers/${providerId}/test`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function refreshProviderModels(
  providerId: string,
): Promise<ProviderModelRefreshResponse> {
  return requestJson<ProviderModelRefreshResponse>(`/api/providers/${providerId}/models/refresh`, {
    method: "POST",
  });
}

export async function setProviderDefaultModel(
  providerId: string,
  modelId: string | null,
): Promise<Provider> {
  return requestJson<Provider>(`/api/providers/${providerId}/default-model`, {
    method: "POST",
    body: JSON.stringify({ model_id: modelId }),
  });
}

export function providerScopeLabel(provider?: Pick<Provider, "is_external">): string {
  if (!provider) {
    return "Не выбран";
  }
  return provider.is_external ? "Внешний" : "Локальный";
}
