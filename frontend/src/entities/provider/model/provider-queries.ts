import { queryOptions } from "@tanstack/react-query";

import { fetchProviderDefaults, fetchProviders } from "../api/provider-api";
import { providerQueryKeys } from "./provider-query-keys";

export const providerQueries = {
  list: () =>
    queryOptions({
      queryKey: providerQueryKeys.list(),
      queryFn: fetchProviders,
    }),
  defaults: () =>
    queryOptions({
      queryKey: providerQueryKeys.defaults(),
      queryFn: fetchProviderDefaults,
    }),
};
