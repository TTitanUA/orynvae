import { describe, expect, it } from "vitest";

import {
  allowedModels,
  defaultModelFor,
  enabledProviders,
  modelSupportsParameter,
  modelSupportsReasoning,
  preferredProvider,
  providerScopeLabel,
  selectableAiProviders,
} from "..";
import type { Provider, ProviderModel } from "..";

describe("providerScopeLabel", () => {
  it("marks external providers explicitly", () => {
    expect(providerScopeLabel({ is_external: true })).toBe("Внешний");
  });

  it("marks local providers explicitly", () => {
    expect(providerScopeLabel({ is_external: false })).toBe("Локальный");
  });

  it("prefers enabled default providers for new work", () => {
    const providers = [
      provider({ id: "disabled-default", is_enabled: false, is_default: true }),
      provider({ id: "enabled-default", is_enabled: true, is_default: true }),
      provider({ id: "enabled", is_enabled: true, is_default: false }),
    ];

    expect(enabledProviders(providers).map((item) => item.id)).toEqual(["enabled-default", "enabled"]);
    expect(preferredProvider(providers)?.id).toBe("enabled-default");
  });

  it("uses only allowed models for provider defaults", () => {
    const testProvider = provider({
      default_model_id: "blocked",
      models: [
        model({ model_id: "blocked", is_allowed: false }),
        model({ model_id: "allowed", display_name: "Allowed", is_allowed: true }),
      ],
    });

    expect(allowedModels(testProvider).map((item) => item.model_id)).toEqual(["allowed"]);
    expect(defaultModelFor(testProvider)).toBe("allowed");
  });

  it("selects only healthy providers with allowed models", () => {
    expect(
      selectableAiProviders([
        provider({ id: "ready", is_enabled: true, models: [model({ is_allowed: true })] }),
        provider({ id: "disabled", is_enabled: false, models: [model({ is_allowed: true })] }),
        provider({ id: "errored", last_error: "offline", models: [model({ is_allowed: true })] }),
        provider({ id: "empty", models: [model({ is_allowed: false })] }),
      ]).map((item) => item.id),
    ).toEqual(["ready"]);
  });

  it("reads supported model parameters defensively", () => {
    const openModel = model({ capabilities: {} });
    const reasoningModel = model({
      capabilities: { supported_parameters: ["temperature", "reasoning.effort"] },
    });

    expect(modelSupportsParameter(openModel, "temperature")).toBe(true);
    expect(modelSupportsParameter(reasoningModel, "top_p")).toBe(false);
    expect(modelSupportsReasoning(reasoningModel)).toBe(true);
    expect(modelSupportsReasoning(openModel)).toBe(false);
  });
});

function provider(patch: Partial<Provider>): Provider {
  return {
    id: "provider",
    type: "lmstudio",
    name: "Provider",
    base_url: "http://localhost:1234/v1",
    has_api_key: false,
    is_local: true,
    is_external: false,
    is_enabled: true,
    is_default: false,
    streaming_enabled: true,
    models_path: "/models",
    chat_path: "/chat/completions",
    default_model_id: "model",
    last_checked_at: null,
    last_error: null,
    created_at: "2026-05-02 00:00:00",
    updated_at: "2026-05-02 00:00:00",
    models: [],
    ...patch,
  };
}

function model(patch: Partial<ProviderModel>): ProviderModel {
  return {
    id: patch.model_id || "model",
    provider_id: "provider",
    model_id: "model",
    display_name: patch.model_id || "Model",
    supports_streaming: true,
    context_window: null,
    capabilities: {},
    is_allowed: true,
    routing_config: null,
    last_seen_at: null,
    created_at: "2026-05-02 00:00:00",
    updated_at: "2026-05-02 00:00:00",
    ...patch,
  };
}
