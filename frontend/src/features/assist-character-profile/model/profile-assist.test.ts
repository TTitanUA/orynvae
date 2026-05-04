import { describe, expect, it } from "vitest";

import { applyProfileAssistPreview, profileAssistPreview } from "./profile-assist";
import type { CharacterFormDraft } from "../../manage-character-form";

function draft(overrides: Partial<CharacterFormDraft> = {}): CharacterFormDraft {
  return {
    name: "Mira",
    gender: "",
    age: "",
    role: "cartographer",
    biography: "",
    motivation: "",
    goal: "",
    fear: "",
    internal_conflict: "",
    relationships: [],
    ...overrides,
  };
}

describe("profile assist preview", () => {
  it("creates selected diffs and applies selected fields", () => {
    const current = draft();
    const preview = profileAssistPreview(current, {
      patch: {
        biography: "Raised among sealed indexes.",
        motivation: "Restore the sea.",
      },
      suggested_relationships: [
        {
          target_character_id: "character-2",
          relationship_type: "mentor",
          description: "Teaches forbidden navigation.",
        },
      ],
      warnings: [],
    });

    preview.fields[1].selected = false;
    const applied = applyProfileAssistPreview(current, preview);

    expect(preview.fields.map((field) => field.field)).toEqual(["biography", "motivation"]);
    expect(applied.biography).toBe("Raised among sealed indexes.");
    expect(applied.motivation).toBe("");
    expect(applied.relationships[0]).toEqual({
      id: undefined,
      target_character_id: "character-2",
      relationship_type: "mentor",
      description: "Teaches forbidden navigation.",
    });
  });
});
