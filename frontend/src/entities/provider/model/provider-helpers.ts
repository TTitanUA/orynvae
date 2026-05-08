import type { Provider, ProviderModel } from "./types";

export function providerScopeLabel(provider?: Pick<Provider, "is_external">): string {
  if (!provider) {
    return "Не выбран";
  }
  return provider.is_external ? "Внешний" : "Локальный";
}

export function enabledProviders(providers: Provider[]): Provider[] {
  return providers.filter((provider) => provider.is_enabled);
}

export function allowedModels(provider?: Pick<Provider, "models">): ProviderModel[] {
  return provider?.models.filter((model) => model.is_allowed) || [];
}

export function selectableAiProviders(providers: Provider[]): Provider[] {
  return providers.filter(
    (provider) => provider.is_enabled && !provider.last_error && allowedModels(provider).length > 0,
  );
}

export function supportedModelParameters(model: ProviderModel | undefined): string[] {
  const value = model?.capabilities.supported_parameters;
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map((item) => item.toLowerCase());
}

export function modelSupportsParameter(model: ProviderModel | undefined, parameter: string): boolean {
  const parameters = supportedModelParameters(model);
  return parameters.length === 0 || parameters.includes(parameter);
}

export function modelSupportsReasoning(model: ProviderModel | undefined): boolean {
  const parameters = supportedModelParameters(model);
  return (
    parameters.includes("reasoning") ||
    parameters.includes("reasoning_effort") ||
    parameters.includes("reasoning.effort")
  );
}

export function defaultModelFor(provider?: Provider): string {
  if (!provider) {
    return "";
  }
  const allowed = allowedModels(provider);
  if (
    provider.default_model_id &&
    allowed.some((model) => model.model_id === provider.default_model_id)
  ) {
    return provider.default_model_id;
  }
  return allowed[0]?.model_id || "";
}

export function preferredProvider(providers: Provider[]): Provider | undefined {
  const enabled = enabledProviders(providers);
  return (
    enabled.find((provider) => provider.is_default && defaultModelFor(provider)) ||
    enabled.find((provider) => defaultModelFor(provider)) ||
    enabled.find((provider) => provider.is_default) ||
    enabled[0]
  );
}
