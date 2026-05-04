import { describe, expect, it } from "vitest";

import { getHealthLabel } from "..";

describe("getHealthLabel", () => {
  it("shows loading state before the backend responds", () => {
    expect(getHealthLabel()).toBe("Проверка...");
  });

  it("shows database state when the API is healthy but the db is absent", () => {
    expect(
      getHealthLabel({
        status: "ok",
        service: "orynvae-backend",
        version: "0.1.0",
        data_dir: "data",
        database_path: "data/app.db",
        database_exists: false,
      }),
    ).toBe("Backend работает, база еще не создана");
  });
});
