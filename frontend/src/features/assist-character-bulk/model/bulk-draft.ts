import type {
  CharacterBulkCreatePayload,
  CharacterBulkDraftItem,
  CharacterBulkDraftRelationship,
  CharacterListItem,
} from "../../../entities/character";

export type CharacterBulkDraftRow = CharacterBulkDraftItem & {
  selected: boolean;
};

export function draftRowsFromResponse(characters: CharacterBulkDraftItem[]): CharacterBulkDraftRow[] {
  return characters.map((character) => ({ ...character, selected: true }));
}

export function bulkDraftToPayload(
  rows: CharacterBulkDraftRow[],
  relationships: CharacterBulkDraftRelationship[],
): CharacterBulkCreatePayload {
  const selectedRows = rows.filter((row) => row.selected && row.name.trim());
  const selectedIds = new Set(selectedRows.map((row) => row.draft_id));
  return {
    characters: selectedRows.map((row) => ({
      draft_id: row.draft_id,
      name: row.name.trim(),
      gender: nullableText(row.gender),
      age: nullableText(row.age),
      role: nullableText(row.role),
      biography: nullableText(row.biography),
    })),
    relationships: relationships
      .filter(
        (relationship) =>
          selectedIds.has(relationship.source_draft_id) &&
          selectedIds.has(relationship.target_draft_id) &&
          relationship.source_draft_id !== relationship.target_draft_id &&
          relationship.relationship_type.trim(),
      )
      .map((relationship) => ({
        source_draft_id: relationship.source_draft_id,
        target_draft_id: relationship.target_draft_id,
        relationship_type: relationship.relationship_type.trim(),
        description: nullableText(relationship.description),
      })),
  };
}

export function duplicateDraftWarnings(
  rows: CharacterBulkDraftRow[],
  existingCharacters: CharacterListItem[],
): string[] {
  const existingNames = new Set(
    existingCharacters.map((character) => character.name.trim().toLowerCase()).filter(Boolean),
  );
  const seenNames = new Set<string>();
  const warnings: string[] = [];
  for (const row of rows) {
    const name = row.name.trim().toLowerCase();
    if (!name) {
      continue;
    }
    if (existingNames.has(name)) {
      warnings.push(`${row.name} already exists in this project.`);
    }
    if (seenNames.has(name)) {
      warnings.push(`${row.name} appears more than once in the draft.`);
    }
    seenNames.add(name);
  }
  return warnings;
}

function nullableText(value: string | null | undefined): string | null {
  const clean = value?.trim() || "";
  return clean || null;
}
