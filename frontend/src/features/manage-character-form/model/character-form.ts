import type {
  CharacterFormPayload,
  CharacterRecord,
  CharacterRelationship,
  CharacterRelationshipPayload,
} from "../../../entities/character";

export type CharacterRelationshipDraft = {
  id?: string | null;
  target_character_id: string;
  relationship_type: string;
  description: string;
};

export type CharacterFormDraft = {
  name: string;
  gender: string;
  age: string;
  role: string;
  biography: string;
  motivation: string;
  goal: string;
  fear: string;
  internal_conflict: string;
  relationships: CharacterRelationshipDraft[];
};

export const emptyCharacterFormDraft: CharacterFormDraft = {
  name: "",
  gender: "",
  age: "",
  role: "",
  biography: "",
  motivation: "",
  goal: "",
  fear: "",
  internal_conflict: "",
  relationships: [],
};

function text(value: string | null | undefined): string {
  return value ?? "";
}

export function characterToFormDraft(character: CharacterRecord): CharacterFormDraft {
  return {
    name: character.name,
    gender: text(character.gender),
    age: text(character.age),
    role: text(character.role),
    biography: text(character.biography),
    motivation: text(character.motivation),
    goal: text(character.goal),
    fear: text(character.fear),
    internal_conflict: text(character.internal_conflict),
    relationships: character.relationships.map(relationshipToDraft),
  };
}

export function relationshipToDraft(
  relationship: CharacterRelationship,
): CharacterRelationshipDraft {
  return {
    id: relationship.id,
    target_character_id: relationship.target_character_id,
    relationship_type: relationship.relationship_type,
    description: text(relationship.description),
  };
}

export function characterFormDraftToPayload(draft: CharacterFormDraft): CharacterFormPayload {
  return {
    name: draft.name.trim(),
    gender: nullableText(draft.gender),
    age: nullableText(draft.age),
    role: nullableText(draft.role),
    biography: nullableText(draft.biography),
    motivation: nullableText(draft.motivation),
    goal: nullableText(draft.goal),
    fear: nullableText(draft.fear),
    internal_conflict: nullableText(draft.internal_conflict),
    relationships: draft.relationships
      .map(relationshipDraftToPayload)
      .filter((relationship): relationship is CharacterRelationshipPayload =>
        Boolean(relationship.target_character_id && relationship.relationship_type),
      ),
  };
}

export function relationshipDraftToPayload(
  draft: CharacterRelationshipDraft,
): CharacterRelationshipPayload {
  return {
    id: draft.id,
    target_character_id: draft.target_character_id,
    relationship_type: draft.relationship_type.trim(),
    description: nullableText(draft.description),
  };
}

export function nullableText(value: string): string | null {
  const clean = value.trim();
  return clean || null;
}
