import { describe, expect, it } from "vitest";

import { bulkDraftToPayload, duplicateDraftWarnings } from "./bulk-draft";

describe("bulkDraftToPayload", () => {
  it("keeps selected characters and valid relationships", () => {
    const payload = bulkDraftToPayload(
      [
        { draft_id: "draft-1", name: " Mira ", selected: true, role: "cartographer" },
        { draft_id: "draft-2", name: "Noa", selected: true, age: "22" },
        { draft_id: "draft-3", name: "Ilo", selected: false },
      ],
      [
        {
          source_draft_id: "draft-1",
          target_draft_id: "draft-2",
          relationship_type: " ally ",
        },
        {
          source_draft_id: "draft-1",
          target_draft_id: "draft-3",
          relationship_type: "mentor",
        },
      ],
    );

    expect(payload.characters.map((character) => character.name)).toEqual(["Mira", "Noa"]);
    expect(payload.relationships).toEqual([
      {
        source_draft_id: "draft-1",
        target_draft_id: "draft-2",
        relationship_type: "ally",
        description: null,
      },
    ]);
  });

  it("reports duplicate draft names", () => {
    const warnings = duplicateDraftWarnings(
      [
        { draft_id: "draft-1", name: "Mira", selected: true },
        { draft_id: "draft-2", name: "mira", selected: true },
      ],
      [
        {
          id: "character-1",
          project_id: "project-1",
          name: "Mira",
          gender: null,
          age: null,
          role: null,
          biography: null,
          motivation: null,
          goal: null,
          fear: null,
          internal_conflict: null,
          created_at: "",
          updated_at: "",
          relationships: [],
        },
      ],
    );

    expect(warnings).toContain("Mira already exists in this project.");
    expect(warnings).toContain("mira appears more than once in the draft.");
  });
});
