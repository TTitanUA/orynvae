import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bulkCreateCharacters,
  createCharacter,
  fetchCharacter,
  fetchCharacters,
  requestCharacterBulkDraft,
  requestCharacterProfileAssist,
  updateCharacter,
} from "./character-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("character-api", () => {
  it("uses the character CRUD endpoints", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ id: "character-1" })));
    vi.stubGlobal("fetch", fetchMock);

    await fetchCharacters("project-1");
    await fetchCharacter("project-1", "character-1");
    await createCharacter("project-1", { name: "Mira", relationships: [] });
    await updateCharacter("project-1", "character-1", { name: "Mira Revised", relationships: [] });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/projects/project-1/characters",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/projects/project-1/characters/character-1",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/projects/project-1/characters",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/projects/project-1/characters/character-1",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("uses bulk and assistant endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(jsonResponse({ characters: [], relationships: [] })));
    vi.stubGlobal("fetch", fetchMock);

    await bulkCreateCharacters("project-1", {
      characters: [{ draft_id: "draft-1", name: "Mira" }],
      relationships: [],
    });
    await requestCharacterBulkDraft("project-1", { prompt: "Mira" });
    await requestCharacterProfileAssist("project-1", {
      draft: { name: "Mira" },
      instruction: "",
      mode: "expand",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/projects/project-1/characters/bulk",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/projects/project-1/characters/assist/bulk-draft",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/projects/project-1/characters/assist/profile",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
