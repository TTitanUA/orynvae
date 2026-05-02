import { describe, expect, it } from "vitest";

import { enabledProviders, preferredProvider, providerScopeLabel } from "./providers";
import type { Provider } from "../types/providers";

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
