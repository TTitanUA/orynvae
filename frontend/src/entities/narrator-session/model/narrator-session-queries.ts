import { queryOptions } from "@tanstack/react-query";

import {
  fetchNarratorKeyEvents,
  fetchNarratorLog,
  fetchNarratorSession,
  fetchNarratorTurns,
} from "../api/narrator-session-api";
import { narratorSessionQueryKeys } from "./narrator-session-query-keys";

export const narratorSessionQueries = {
  detail: (sessionId: string) =>
    queryOptions({
      queryKey: narratorSessionQueryKeys.detail(sessionId),
      queryFn: () => fetchNarratorSession(sessionId),
      enabled: Boolean(sessionId),
    }),
  turns: (sessionId: string) =>
    queryOptions({
      queryKey: narratorSessionQueryKeys.turns(sessionId),
      queryFn: () => fetchNarratorTurns(sessionId),
      enabled: Boolean(sessionId),
    }),
  log: (sessionId: string) =>
    queryOptions({
      queryKey: narratorSessionQueryKeys.log(sessionId),
      queryFn: () => fetchNarratorLog(sessionId),
      enabled: Boolean(sessionId),
    }),
  keyEvents: (sessionId: string) =>
    queryOptions({
      queryKey: narratorSessionQueryKeys.keyEvents(sessionId),
      queryFn: () => fetchNarratorKeyEvents(sessionId),
      enabled: Boolean(sessionId),
    }),
};
