import { requestJson } from "../../../shared/api";
import type { Forecast, ForecastGeneratePayload, ForecastListResponse } from "../model/types";

export async function fetchForecasts(projectId: string): Promise<ForecastListResponse> {
  return requestJson<ForecastListResponse>(`/api/projects/${projectId}/forecasts`);
}

export async function fetchForecast(projectId: string, forecastId: string): Promise<Forecast> {
  return requestJson<Forecast>(`/api/projects/${projectId}/forecasts/${forecastId}`);
}

export async function generateForecast(
  projectId: string,
  payload: ForecastGeneratePayload,
): Promise<Forecast> {
  return requestJson<Forecast>(`/api/projects/${projectId}/forecast`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function selectForecastOption(
  projectId: string,
  forecastId: string,
  optionId: string,
): Promise<Forecast> {
  return requestJson<Forecast>(
    `/api/projects/${projectId}/forecasts/${forecastId}/options/${optionId}/select`,
    {
      method: "POST",
    },
  );
}
