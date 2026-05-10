import type { Provider, ProviderModel } from "../../provider";
import { allowedModels, modelSupportsParameter } from "../../provider";
import type { ProjectAgentSettingSource } from "./types";

export function providerById(providers: Provider[], providerId: string | null): Provider | undefined {
  return providers.find((provider) => provider.id === providerId);
}

export function modelById(provider: Provider | undefined, modelId: string | null): ProviderModel | undefined {
  return allowedModels(provider).find((model) => model.model_id === modelId);
}

export function defaultAllowedModel(provider: Provider | undefined): ProviderModel | undefined {
  const models = allowedModels(provider);
  return (
    models.find((model) => model.model_id === provider?.default_model_id) ||
    models[0]
  );
}

export function topPEnabled(model: ProviderModel | undefined): boolean {
  return modelSupportsParameter(model, "top_p");
}

export function sourceLabel(source: ProjectAgentSettingSource): string {
  if (source === "project") {
    return "Проект";
  }
  if (source === "custom") {
    return "Свое";
  }
  return "Пресет";
}
