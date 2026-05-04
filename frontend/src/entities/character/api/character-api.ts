import { requestJson, requestVoid } from "../../../shared/api";
import type {
  CharacterBulkCreatePayload,
  CharacterBulkCreateResponse,
  CharacterBulkDraftRequest,
  CharacterBulkDraftResponse,
  CharacterFormPayload,
  CharacterListItem,
  CharacterProfileAssistRequest,
  CharacterProfileAssistResponse,
  CharacterRecord,
} from "../model/types";

export async function fetchCharacters(projectId: string): Promise<CharacterListItem[]> {
  return requestJson<CharacterListItem[]>(`/api/projects/${projectId}/characters`);
}

export async function createCharacter(
  projectId: string,
  payload: CharacterFormPayload,
): Promise<CharacterRecord> {
  return requestJson<CharacterRecord>(`/api/projects/${projectId}/characters`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchCharacter(
  projectId: string,
  characterId: string,
): Promise<CharacterRecord> {
  return requestJson<CharacterRecord>(`/api/projects/${projectId}/characters/${characterId}`);
}

export async function updateCharacter(
  projectId: string,
  characterId: string,
  payload: CharacterFormPayload,
): Promise<CharacterRecord> {
  return requestJson<CharacterRecord>(`/api/projects/${projectId}/characters/${characterId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteCharacter(projectId: string, characterId: string): Promise<void> {
  return requestVoid(`/api/projects/${projectId}/characters/${characterId}`, {
    method: "DELETE",
  });
}

export async function bulkCreateCharacters(
  projectId: string,
  payload: CharacterBulkCreatePayload,
): Promise<CharacterBulkCreateResponse> {
  return requestJson<CharacterBulkCreateResponse>(`/api/projects/${projectId}/characters/bulk`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function requestCharacterBulkDraft(
  projectId: string,
  payload: CharacterBulkDraftRequest,
): Promise<CharacterBulkDraftResponse> {
  return requestJson<CharacterBulkDraftResponse>(
    `/api/projects/${projectId}/characters/assist/bulk-draft`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function requestCharacterProfileAssist(
  projectId: string,
  payload: CharacterProfileAssistRequest,
): Promise<CharacterProfileAssistResponse> {
  return requestJson<CharacterProfileAssistResponse>(
    `/api/projects/${projectId}/characters/assist/profile`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}
