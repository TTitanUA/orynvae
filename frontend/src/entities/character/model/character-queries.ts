import { queryOptions } from "@tanstack/react-query";

import { fetchCharacter, fetchCharacters } from "../api/character-api";
import { characterQueryKeys } from "./character-query-keys";

export const characterQueries = {
  list: (projectId: string) =>
    queryOptions({
      queryKey: characterQueryKeys.list(projectId),
      queryFn: () => fetchCharacters(projectId),
      enabled: Boolean(projectId),
    }),
  detail: (projectId: string, characterId: string) =>
    queryOptions({
      queryKey: characterQueryKeys.detail(projectId, characterId),
      queryFn: () => fetchCharacter(projectId, characterId),
      enabled: Boolean(projectId && characterId),
    }),
};
