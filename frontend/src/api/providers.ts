import type {
  Provider,
  ProviderCreatePayload,
  ProviderDefaults,
  ProviderModel,
  ProviderModelPreferencesUpdatePayload,
  ProviderModelRefreshResponse,
  ProviderTestResponse,
  ProviderUpdatePayload,
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

async function requestVoid(url: string, init?: RequestInit): Promise<void> {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    const detail = body && typeof body.detail === "string" ? body.detail : response.statusText;
    throw new Error(detail || `Request failed with status ${response.status}`);
  }
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

export async function updateProvider(
  providerId: string,
  payload: ProviderUpdatePayload,
): Promise<Provider> {
  return requestJson<Provider>(`/api/providers/${providerId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteProvider(providerId: string): Promise<void> {
  return requestVoid(`/api/providers/${providerId}`, {
    method: "DELETE",
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

export async function updateProviderModelPreferences(
  providerId: string,
  payload: ProviderModelPreferencesUpdatePayload,
): Promise<Provider> {
  return requestJson<Provider>(`/api/providers/${providerId}/models/preferences`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function setDefaultProvider(providerId: string): Promise<Provider> {
  return requestJson<Provider>(`/api/providers/${providerId}/default-provider`, {
    method: "POST",
  });
}

export function providerScopeLabel(provider?: Pick<Provider, "is_external">): string {
  if (!provider) {
    return "Не выбран";
  }
  return provider.is_external ? "Внешний" : "Локальный";
}

export function enabledProviders(providers: Provider[]): Provider[] {
  return providers.filter((provider) => provider.is_enabled);
}

export function allowedModels(provider?: Pick<Provider, "models">): ProviderModel[] {
  return provider?.models.filter((model) => model.is_allowed) || [];
}

export function defaultModelFor(provider?: Provider): string {
  if (!provider) {
    return "";
  }
  const allowed = allowedModels(provider);
  if (
    provider.default_model_id &&
    allowed.some((model) => model.model_id === provider.default_model_id)
  ) {
    return provider.default_model_id;
  }
  return allowed[0]?.model_id || "";
}

export function preferredProvider(providers: Provider[]): Provider | undefined {
  const enabled = enabledProviders(providers);
  return (
    enabled.find((provider) => provider.is_default && defaultModelFor(provider)) ||
    enabled.find((provider) => defaultModelFor(provider)) ||
    enabled.find((provider) => provider.is_default) ||
    enabled[0]
  );
}
