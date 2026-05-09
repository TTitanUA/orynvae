export const forecastQueryKeys = {
  all: ["forecasts"] as const,
  list: (projectId: string) => [...forecastQueryKeys.all, "list", projectId] as const,
  detail: (projectId: string, forecastId: string) =>
    [...forecastQueryKeys.all, "detail", projectId, forecastId] as const,
};
