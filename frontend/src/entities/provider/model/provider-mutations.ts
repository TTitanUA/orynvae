import { mutationOptions } from "@tanstack/react-query";

import {
  createProvider,
  deleteProvider,
  refreshProviderModels,
  setDefaultProvider,
  setProviderDefaultModel,
  testProvider,
  updateProvider,
  updateProviderModelPreferences,
} from "../api/provider-api";
import type {
  ProviderCreatePayload,
  ProviderModelPreferencesUpdatePayload,
  ProviderUpdatePayload,
} from "./types";

export const providerMutations = {
  create: () =>
    mutationOptions({
      mutationKey: ["providers", "create"] as const,
      mutationFn: (payload: ProviderCreatePayload) => createProvider(payload),
    }),
  update: () =>
    mutationOptions({
      mutationKey: ["providers", "update"] as const,
      mutationFn: ({ providerId, payload }: { providerId: string; payload: ProviderUpdatePayload }) =>
        updateProvider(providerId, payload),
    }),
  delete: () =>
    mutationOptions({
      mutationKey: ["providers", "delete"] as const,
      mutationFn: (providerId: string) => deleteProvider(providerId),
    }),
  test: () =>
    mutationOptions({
      mutationKey: ["providers", "test"] as const,
      mutationFn: (providerId: string) => testProvider(providerId),
    }),
  refreshModels: () =>
    mutationOptions({
      mutationKey: ["providers", "models", "refresh"] as const,
      mutationFn: (providerId: string) => refreshProviderModels(providerId),
    }),
  setDefaultModel: () =>
    mutationOptions({
      mutationKey: ["providers", "default-model"] as const,
      mutationFn: ({ providerId, modelId }: { providerId: string; modelId: string | null }) =>
        setProviderDefaultModel(providerId, modelId),
    }),
  updateModelPreferences: () =>
    mutationOptions({
      mutationKey: ["providers", "models", "preferences"] as const,
      mutationFn: ({
        providerId,
        payload,
      }: {
        providerId: string;
        payload: ProviderModelPreferencesUpdatePayload;
      }) => updateProviderModelPreferences(providerId, payload),
    }),
  setDefaultProvider: () =>
    mutationOptions({
      mutationKey: ["providers", "default-provider"] as const,
      mutationFn: (providerId: string) => setDefaultProvider(providerId),
    }),
};
