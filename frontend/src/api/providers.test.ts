import { describe, expect, it } from "vitest";

import { providerScopeLabel } from "./providers";

describe("providerScopeLabel", () => {
  it("marks external providers explicitly", () => {
    expect(providerScopeLabel({ is_external: true })).toBe("Внешний");
  });

  it("marks local providers explicitly", () => {
    expect(providerScopeLabel({ is_external: false })).toBe("Локальный");
  });
});
