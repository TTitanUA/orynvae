import { queryOptions } from "@tanstack/react-query";

import { fetchHealth } from "../api/health-api";
import { healthQueryKeys } from "./health-query-keys";

export const healthQueries = {
  status: () =>
    queryOptions({
      queryKey: healthQueryKeys.status(),
      queryFn: fetchHealth,
    }),
};
