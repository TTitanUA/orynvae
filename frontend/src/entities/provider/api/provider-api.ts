import type {
  Provider,
  ProviderCreatePayload,
  ProviderDefaults,
  ProviderModelPreferencesUpdatePayload,
  ProviderModelRefreshResponse,
  ProviderTestResponse,
  ProviderUpdatePayload,
} from "../model/types";
import { requestJson, requestVoid } from "../../../shared/api";

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
