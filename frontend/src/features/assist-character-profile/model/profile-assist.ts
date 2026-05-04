import type {
  CharacterProfileAssistResponse,
  CharacterProfileDraft,
  CharacterRelationshipPayload,
} from "../../../entities/character";
import type { CharacterFormDraft, CharacterRelationshipDraft } from "../../manage-character-form";

export const profileFieldLabels: Record<keyof CharacterProfileDraft, string> = {
  name: "Name",
  gender: "Gender",
  age: "Age",
  role: "Role",
  biography: "Biography",
  motivation: "Motivation",
  goal: "Goal",
  fear: "Fear",
  internal_conflict: "Internal conflict",
};

export type ProfileAssistFieldDiff = {
  field: keyof CharacterProfileDraft;
  label: string;
  currentValue: string;
  nextValue: string;
  selected: boolean;
};

export type ProfileAssistPreview = {
  fields: ProfileAssistFieldDiff[];
  relationships: Array<CharacterRelationshipPayload & { selected: boolean }>;
};

export function profileAssistPreview(
  draft: CharacterFormDraft,
  response: CharacterProfileAssistResponse,
): ProfileAssistPreview {
  const fields = (Object.keys(profileFieldLabels) as Array<keyof CharacterProfileDraft>)
    .map((field) => {
      const nextValue = response.patch[field];
      if (!nextValue || nextValue === draft[field]) {
        return undefined;
      }
      return {
        field,
        label: profileFieldLabels[field],
        currentValue: draft[field],
        nextValue,
        selected: true,
      };
    })
    .filter((field): field is ProfileAssistFieldDiff => Boolean(field));
  return {
    fields,
    relationships: response.suggested_relationships.map((relationship) => ({
      ...relationship,
      selected: true,
    })),
  };
}

export function applyProfileAssistPreview(
  draft: CharacterFormDraft,
  preview: ProfileAssistPreview,
): CharacterFormDraft {
  const next: CharacterFormDraft = { ...draft, relationships: [...draft.relationships] };
  for (const field of preview.fields) {
    if (field.selected) {
      next[field.field] = field.nextValue;
    }
  }
  const relationshipDrafts: CharacterRelationshipDraft[] = preview.relationships
    .filter((relationship) => relationship.selected)
    .map((relationship) => ({
      id: relationship.id,
      target_character_id: relationship.target_character_id,
      relationship_type: relationship.relationship_type,
      description: relationship.description || "",
    }));
  return { ...next, relationships: [...next.relationships, ...relationshipDrafts] };
}
