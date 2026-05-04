import { mutationOptions } from "@tanstack/react-query";

import {
  bulkCreateCharacters,
  createCharacter,
  deleteCharacter,
  requestCharacterBulkDraft,
  requestCharacterProfileAssist,
  updateCharacter,
} from "../api/character-api";
import type {
  CharacterBulkCreatePayload,
  CharacterBulkDraftRequest,
  CharacterFormPayload,
  CharacterProfileAssistRequest,
} from "./types";

export const characterMutations = {
  create: (projectId: string) =>
    mutationOptions({
      mutationKey: ["characters", projectId, "create"] as const,
      mutationFn: (payload: CharacterFormPayload) => createCharacter(projectId, payload),
    }),
  update: (projectId: string, characterId: string) =>
    mutationOptions({
      mutationKey: ["characters", projectId, characterId, "update"] as const,
      mutationFn: (payload: CharacterFormPayload) =>
        updateCharacter(projectId, characterId, payload),
    }),
  delete: (projectId: string) =>
    mutationOptions({
      mutationKey: ["characters", projectId, "delete"] as const,
      mutationFn: (characterId: string) => deleteCharacter(projectId, characterId),
    }),
  bulkCreate: (projectId: string) =>
    mutationOptions({
      mutationKey: ["characters", projectId, "bulk-create"] as const,
      mutationFn: (payload: CharacterBulkCreatePayload) =>
        bulkCreateCharacters(projectId, payload),
    }),
  bulkDraft: (projectId: string) =>
    mutationOptions({
      mutationKey: ["characters", projectId, "bulk-draft"] as const,
      mutationFn: (payload: CharacterBulkDraftRequest) =>
        requestCharacterBulkDraft(projectId, payload),
    }),
  profileAssist: (projectId: string) =>
    mutationOptions({
      mutationKey: ["characters", projectId, "profile-assist"] as const,
      mutationFn: (payload: CharacterProfileAssistRequest) =>
        requestCharacterProfileAssist(projectId, payload),
    }),
};
