import { mutationOptions } from "@tanstack/react-query";

import { generateForecast, selectForecastOption } from "../api/forecast-api";
import type { ForecastGeneratePayload } from "./types";

export const forecastMutations = {
  generate: (projectId: string) =>
    mutationOptions({
      mutationKey: ["forecasts", projectId, "generate"] as const,
      mutationFn: (payload: ForecastGeneratePayload) => generateForecast(projectId, payload),
    }),
  selectOption: (projectId: string, forecastId: string) =>
    mutationOptions({
      mutationKey: ["forecasts", projectId, forecastId, "select-option"] as const,
      mutationFn: (optionId: string) => selectForecastOption(projectId, forecastId, optionId),
    }),
};
