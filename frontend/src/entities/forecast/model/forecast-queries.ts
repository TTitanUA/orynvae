import { queryOptions } from "@tanstack/react-query";

import { fetchForecast, fetchForecasts } from "../api/forecast-api";
import { forecastQueryKeys } from "./forecast-query-keys";

export const forecastQueries = {
  list: (projectId: string) =>
    queryOptions({
      queryKey: forecastQueryKeys.list(projectId),
      queryFn: () => fetchForecasts(projectId),
      enabled: Boolean(projectId),
    }),
  detail: (projectId: string, forecastId: string | null) =>
    queryOptions({
      queryKey: forecastQueryKeys.detail(projectId, forecastId || ""),
      queryFn: () => fetchForecast(projectId, forecastId || ""),
      enabled: Boolean(projectId && forecastId),
    }),
};
