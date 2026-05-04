export type CharacterRelationship = {
  id: string;
  project_id: string;
  source_character_id: string;
  target_character_id: string;
  relationship_type: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  source_character_name?: string | null;
  target_character_name?: string | null;
};

export type CharacterRelationshipPayload = {
  id?: string | null;
  target_character_id: string;
  relationship_type: string;
  description?: string | null;
};

export type CharacterRecord = {
  id: string;
  project_id: string;
  name: string;
  gender: string | null;
  age: string | null;
  role: string | null;
  biography: string | null;
  motivation: string | null;
  goal: string | null;
  fear: string | null;
  internal_conflict: string | null;
  created_at: string;
  updated_at: string;
  relationships: CharacterRelationship[];
};

export type CharacterListItem = CharacterRecord;

export type CharacterFormPayload = {
  name: string;
  gender?: string | null;
  age?: string | null;
  role?: string | null;
  biography?: string | null;
  motivation?: string | null;
  goal?: string | null;
  fear?: string | null;
  internal_conflict?: string | null;
  relationships?: CharacterRelationshipPayload[];
};

export type CharacterBulkCreateItem = {
  draft_id?: string | null;
  name: string;
  gender?: string | null;
  age?: string | null;
  role?: string | null;
  biography?: string | null;
  motivation?: string | null;
  goal?: string | null;
  fear?: string | null;
  internal_conflict?: string | null;
};

export type CharacterBulkCreateRelationship = {
  source_draft_id: string;
  target_draft_id: string;
  relationship_type: string;
  description?: string | null;
};

export type CharacterBulkCreatePayload = {
  characters: CharacterBulkCreateItem[];
  relationships: CharacterBulkCreateRelationship[];
};

export type CharacterBulkCreateResponse = {
  characters: CharacterRecord[];
  relationships: CharacterRelationship[];
};

export type CharacterBulkDraftRequest = {
  prompt: string;
  provider_id?: string | null;
  model_id?: string | null;
  max_characters?: number;
  include_relationships?: boolean;
};

export type CharacterBulkDraftItem = {
  draft_id: string;
  name: string;
  gender?: string | null;
  age?: string | null;
  role?: string | null;
  biography?: string | null;
};

export type CharacterBulkDraftRelationship = {
  source_draft_id: string;
  target_draft_id: string;
  relationship_type: string;
  description?: string | null;
};

export type CharacterBulkDraftResponse = {
  characters: CharacterBulkDraftItem[];
  relationships: CharacterBulkDraftRelationship[];
  warnings: string[];
  raw_text?: string | null;
};

export type CharacterProfileAssistMode = "expand" | "revise" | "relationships" | "conflict";

export type CharacterProfileDraft = {
  name?: string | null;
  gender?: string | null;
  age?: string | null;
  role?: string | null;
  biography?: string | null;
  motivation?: string | null;
  goal?: string | null;
  fear?: string | null;
  internal_conflict?: string | null;
};

export type CharacterProfileAssistRequest = {
  character_id?: string | null;
  draft: CharacterProfileDraft;
  instruction: string;
  mode: CharacterProfileAssistMode;
  provider_id?: string | null;
  model_id?: string | null;
};

export type CharacterProfileAssistResponse = {
  patch: CharacterProfileDraft;
  suggested_relationships: CharacterRelationshipPayload[];
  warnings: string[];
  raw_text?: string | null;
};
