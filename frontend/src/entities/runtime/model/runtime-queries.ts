import { queryOptions } from "@tanstack/react-query";

import { fetchRuntimeStatus } from "../api/runtime-api";
import { runtimeQueryKeys } from "./runtime-query-keys";

export const runtimeQueries = {
  status: () =>
    queryOptions({
      queryKey: runtimeQueryKeys.status,
      queryFn: fetchRuntimeStatus,
    }),
};
