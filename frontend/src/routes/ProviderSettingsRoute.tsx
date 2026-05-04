import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Cloud,
  FileInput,
  FileOutput,
  Gauge,
  KeyRound,
  ListChecks,
  MessageSquareCode,
  Monitor,
  PlugZap,
  Power,
  PowerOff,
  RefreshCw,
  Save,
  Search,
  ServerCog,
  Settings2,
  SlidersHorizontal,
  Star,
  Trash2,
  Workflow,
} from "lucide-react";

import {
  createProvider,
  deleteProvider,
  fetchProviderDefaults,
  fetchProviders,
  providerScopeLabel,
  refreshProviderModels,
  setDefaultProvider,
  testProvider,
  updateProvider,
  updateProviderModelPreferences,
} from "../api/providers";
import { AppShell } from "../components/templates/AppShell";
import type {
  OpenRouterQuantization,
  OpenRouterRoutingConfig,
  OpenRouterSortMode,
  Provider,
  ProviderCreatePayload,
  ProviderDefaults,
  ProviderModel,
  ProviderModelPreferencesUpdatePayload,
  ProviderType,
} from "../types/providers";
import "./ProviderSettingsRoute.css";

type ProviderFormState = {
  type: ProviderType;
  name: string;
  baseUrl: string;
  apiKey: string;
  isLocal: boolean;
  streamingEnabled: boolean;
  modelsPath: string;
  chatPath: string;
};

type ModelPreferenceDraft = {
  isAllowed: boolean;
  routingConfig: OpenRouterRoutingConfig | null;
  routingText: Partial<Record<OpenRouterRoutingListField, string>>;
  selected: boolean;
  expanded: boolean;
};

type ProviderPreferenceDraft = {
  defaultModelId: string;
  models: Record<string, ModelPreferenceDraft>;
  query: string;
  allowedOnly: boolean;
};

type OpenRouterRoutingListField = "order" | "only" | "ignore";

type ModelMetadataItem = {
  icon: typeof Gauge;
  label: string;
  value: string;
  tooltip: string;
};

const initialForm: ProviderFormState = {
  type: "lmstudio",
  name: "LM Studio",
  baseUrl: "http://localhost:1234/v1",
  apiKey: "",
  isLocal: true,
  streamingEnabled: true,
  modelsPath: "/models",
  chatPath: "/chat/completions",
};

const quantizationOptions: OpenRouterQuantization[] = [
  "int4",
  "int8",
  "fp4",
  "fp6",
  "fp8",
  "fp16",
  "bf16",
  "fp32",
  "unknown",
];

function formFromDefaults(defaults: ProviderDefaults): ProviderFormState {
  return {
    type: defaults.type,
    name: defaults.label,
    baseUrl: defaults.base_url,
    apiKey: "",
    isLocal: defaults.is_local,
    streamingEnabled: true,
    modelsPath: defaults.models_path,
    chatPath: defaults.chat_path,
  };
}

function providerIcon(provider: Provider) {
  return provider.is_external ? <Cloud size={18} aria-hidden="true" /> : <Monitor size={18} aria-hidden="true" />;
}

function preferenceFromProvider(
  provider: Provider,
  previous?: ProviderPreferenceDraft,
): ProviderPreferenceDraft {
  const models: Record<string, ModelPreferenceDraft> = {};
  for (const model of provider.models) {
    const previousModel = previous?.models[model.model_id];
    models[model.model_id] = {
      isAllowed: previousModel?.isAllowed ?? model.is_allowed,
      routingConfig: previousModel?.routingConfig ?? model.routing_config,
      routingText: previousModel?.routingText ?? {},
      selected: previousModel?.selected ?? false,
      expanded: previousModel?.expanded ?? false,
    };
  }
  let defaultModelId = previous?.defaultModelId ?? provider.default_model_id ?? "";
  if (defaultModelId && !models[defaultModelId]?.isAllowed) {
    defaultModelId =
      provider.default_model_id && models[provider.default_model_id]?.isAllowed
        ? provider.default_model_id
        : "";
  }
  return {
    defaultModelId,
    models,
    query: previous?.query ?? "",
    allowedOnly: previous?.allowedOnly ?? false,
  };
}

function buildProviderPreferences(
  providers: Provider[],
  current: Record<string, ProviderPreferenceDraft>,
): Record<string, ProviderPreferenceDraft> {
  return Object.fromEntries(
    providers.map((provider) => [
      provider.id,
      preferenceFromProvider(provider, current[provider.id]),
    ]),
  );
}

function splitList(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function listValue(value: string[] | undefined): string {
  return value?.join("\n") || "";
}

function routingListValue(
  preference: ModelPreferenceDraft,
  field: OpenRouterRoutingListField,
  config: OpenRouterRoutingConfig,
): string {
  return preference.routingText[field] ?? listValue(config[field]);
}

function numberOrUndefined(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function percentileValue(value: OpenRouterRoutingConfig["preferred_max_latency"]): string {
  if (typeof value === "number") {
    return String(value);
  }
  return value?.p90 === undefined ? "" : String(value.p90);
}

function sortMode(config: OpenRouterRoutingConfig | null): OpenRouterSortMode | "" {
  if (!config?.sort) {
    return "";
  }
  return typeof config.sort === "string" ? config.sort : config.sort.by;
}

function sortPartition(config: OpenRouterRoutingConfig | null): "model" | "none" | "" {
  if (!config?.sort || typeof config.sort === "string") {
    return "";
  }
  return config.sort.partition || "";
}

function stripEmpty(value: unknown): unknown {
  if (Array.isArray(value)) {
    const cleaned = value.map(stripEmpty).filter((item) => item !== undefined);
    return cleaned.length > 0 ? cleaned : undefined;
  }
  if (value && typeof value === "object") {
    const cleaned = Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, stripEmpty(item)] as const)
        .filter(([, item]) => item !== undefined),
    );
    return Object.keys(cleaned).length > 0 ? cleaned : undefined;
  }
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "string" && !value.trim()) {
    return undefined;
  }
  return value;
}

function cleanRoutingConfig(
  config: OpenRouterRoutingConfig | null | undefined,
): OpenRouterRoutingConfig | null {
  const cleaned = stripEmpty(config);
  return cleaned && typeof cleaned === "object" && !Array.isArray(cleaned)
    ? (cleaned as OpenRouterRoutingConfig)
    : null;
}

function routingWarnings(config: OpenRouterRoutingConfig | null): string[] {
  const cleaned = cleanRoutingConfig(config);
  if (!cleaned) {
    return [];
  }
  const warnings: string[] = [];
  if (
    cleaned.allow_fallbacks === false &&
    !cleaned.order?.length &&
    !cleaned.only?.length
  ) {
    warnings.push("Fallbacks are off without an order or only list.");
  }
  const only = new Set(cleaned.only || []);
  const overlap = (cleaned.ignore || []).filter((item) => only.has(item));
  if (overlap.length > 0) {
    warnings.push(`Provider appears in both only and ignore: ${overlap.join(", ")}`);
  }
  return warnings;
}

function modelMatchesQuery(model: ProviderModel, query: string): boolean {
  const lowerQuery = query.trim().toLowerCase();
  if (!lowerQuery) {
    return true;
  }
  return (
    model.model_id.toLowerCase().includes(lowerQuery) ||
    model.display_name.toLowerCase().includes(lowerQuery)
  );
}

function compareModelsByPreference(
  left: ProviderModel,
  right: ProviderModel,
  preference: ProviderPreferenceDraft,
): number {
  const leftAllowed = Boolean(preference.models[left.model_id]?.isAllowed);
  const rightAllowed = Boolean(preference.models[right.model_id]?.isAllowed);
  if (leftAllowed !== rightAllowed) {
    return leftAllowed ? -1 : 1;
  }
  const leftDefault = preference.defaultModelId === left.model_id;
  const rightDefault = preference.defaultModelId === right.model_id;
  if (leftDefault !== rightDefault) {
    return leftDefault ? -1 : 1;
  }
  return left.display_name.localeCompare(right.display_name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function capabilityString(model: ProviderModel, key: string): string | undefined {
  const value = model.capabilities[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function capabilityStringList(model: ProviderModel, key: string): string[] {
  const value = model.capabilities[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
}

function contextLength(model: ProviderModel): number | undefined {
  const value = model.capabilities.context_length;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return model.context_window ?? undefined;
}

function formatList(value: string[], limit = 6): string {
  if (value.length <= limit) {
    return value.join(", ");
  }
  return `${value.slice(0, limit).join(", ")} +${value.length - limit}`;
}

function modelMetadataItems(model: ProviderModel): ModelMetadataItem[] {
  const items: ModelMetadataItem[] = [];
  const context = contextLength(model);
  if (context !== undefined) {
    items.push({
      icon: Gauge,
      label: "Context",
      value: `${new Intl.NumberFormat("en-US").format(context)} tokens`,
      tooltip: "Context window: maximum number of tokens this model can read.",
    });
  }
  const inputModalities = capabilityStringList(model, "input_modalities");
  if (inputModalities.length > 0) {
    items.push({
      icon: FileInput,
      label: "Input",
      value: inputModalities.join(", "),
      tooltip: `Input modalities supported by the model: ${inputModalities.join(", ")}.`,
    });
  }
  const outputModalities = capabilityStringList(model, "output_modalities");
  if (outputModalities.length > 0) {
    items.push({
      icon: FileOutput,
      label: "Output",
      value: outputModalities.join(", "),
      tooltip: `Output modalities produced by the model: ${outputModalities.join(", ")}.`,
    });
  }
  const modality = capabilityString(model, "modality");
  if (modality) {
    items.push({
      icon: Workflow,
      label: "Mode",
      value: modality,
      tooltip: "OpenRouter modality mapping, for example text to text or text to image.",
    });
  }
  const instructType = capabilityString(model, "instruct_type");
  if (instructType) {
    items.push({
      icon: MessageSquareCode,
      label: "Instruction",
      value: instructType,
      tooltip: "Prompt or instruction format expected by this model.",
    });
  }
  const tokenizer = capabilityString(model, "tokenizer");
  if (tokenizer) {
    items.push({
      icon: SlidersHorizontal,
      label: "Tokenizer",
      value: tokenizer,
      tooltip: "Tokenizer family used for estimating and counting tokens.",
    });
  }
  const supportedParameters = capabilityStringList(model, "supported_parameters");
  if (supportedParameters.length > 0) {
    items.push({
      icon: ListChecks,
      label: "Params",
      value: formatList(supportedParameters),
      tooltip: `Supported request parameters: ${supportedParameters.join(", ")}.`,
    });
  }
  return items;
}

async function fetchProviderState() {
  return Promise.all([fetchProviderDefaults(), fetchProviders()]);
}

export function ProviderSettingsRoute() {
  const [defaults, setDefaults] = useState<ProviderDefaults[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [form, setForm] = useState<ProviderFormState>(initialForm);
  const [modelPreferences, setModelPreferences] = useState<Record<string, ProviderPreferenceDraft>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyProviderId, setBusyProviderId] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const selectedDefault = useMemo(
    () => defaults.find((item) => item.type === form.type),
    [defaults, form.type],
  );

  async function loadProviderState() {
    setLoading(true);
    setError(undefined);
    try {
      const [nextDefaults, nextProviders] = await fetchProviderState();
      setDefaults(nextDefaults);
      setProviders(nextProviders);
      setModelPreferences((current) => buildProviderPreferences(nextProviders, current));
      if (!nextDefaults.some((item) => item.type === form.type) && nextDefaults[0]) {
        setForm(formFromDefaults(nextDefaults[0]));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить провайдеры");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let isCurrent = true;

    fetchProviderState()
      .then(([nextDefaults, nextProviders]) => {
        if (!isCurrent) {
          return;
        }
        setDefaults(nextDefaults);
        setProviders(nextProviders);
        setModelPreferences((current) => buildProviderPreferences(nextProviders, current));
        if (!nextDefaults.some((item) => item.type === initialForm.type) && nextDefaults[0]) {
          setForm(formFromDefaults(nextDefaults[0]));
        }
      })
      .catch((reason) => {
        if (isCurrent) {
          setError(reason instanceof Error ? reason.message : "Не удалось загрузить провайдеры");
        }
      })
      .finally(() => {
        if (isCurrent) {
          setLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  function updateType(type: ProviderType) {
    const nextDefault = defaults.find((item) => item.type === type);
    setForm(nextDefault ? formFromDefaults(nextDefault) : { ...form, type });
  }

  function updatePreference(
    provider: Provider,
    updater: (draft: ProviderPreferenceDraft) => ProviderPreferenceDraft,
  ) {
    setModelPreferences((current) => ({
      ...current,
      [provider.id]: updater(current[provider.id] ?? preferenceFromProvider(provider)),
    }));
  }

  function updateModelPreference(
    provider: Provider,
    modelId: string,
    patch: Partial<ModelPreferenceDraft>,
  ) {
    updatePreference(provider, (draft) => {
      const currentModel = draft.models[modelId];
      if (!currentModel) {
        return draft;
      }
      const nextModel = { ...currentModel, ...patch };
      const nextDraft: ProviderPreferenceDraft = {
        ...draft,
        models: {
          ...draft.models,
          [modelId]: nextModel,
        },
      };
      if (patch.isAllowed === false && draft.defaultModelId === modelId) {
        nextDraft.defaultModelId = "";
      }
      if (patch.isAllowed === true && !draft.defaultModelId) {
        nextDraft.defaultModelId = modelId;
      }
      return nextDraft;
    });
  }

  function updateRouting(
    provider: Provider,
    modelId: string,
    patch: Partial<OpenRouterRoutingConfig>,
  ) {
    updatePreference(provider, (draft) => {
      const currentModel = draft.models[modelId];
      if (!currentModel) {
        return draft;
      }
      return {
        ...draft,
        models: {
          ...draft.models,
          [modelId]: {
            ...currentModel,
            routingConfig: {
              ...(currentModel.routingConfig || {}),
              ...patch,
            },
          },
        },
      };
    });
  }

  function updateRoutingList(
    provider: Provider,
    modelId: string,
    field: OpenRouterRoutingListField,
    value: string,
  ) {
    updatePreference(provider, (draft) => {
      const currentModel = draft.models[modelId];
      if (!currentModel) {
        return draft;
      }
      return {
        ...draft,
        models: {
          ...draft.models,
          [modelId]: {
            ...currentModel,
            routingConfig: {
              ...(currentModel.routingConfig || {}),
              [field]: splitList(value),
            },
            routingText: {
              ...currentModel.routingText,
              [field]: value,
            },
          },
        },
      };
    });
  }

  function updateSort(provider: Provider, modelId: string, mode: OpenRouterSortMode | "") {
    const state = modelPreferences[provider.id] ?? preferenceFromProvider(provider);
    const partition = sortPartition(state.models[modelId]?.routingConfig || null);
    updateRouting(provider, modelId, {
      sort: mode ? (partition ? { by: mode, partition } : mode) : undefined,
    });
  }

  function updateSortPartition(provider: Provider, modelId: string, partition: "model" | "none" | "") {
    const state = modelPreferences[provider.id] ?? preferenceFromProvider(provider);
    const mode = sortMode(state.models[modelId]?.routingConfig || null);
    updateRouting(provider, modelId, {
      sort: mode ? (partition ? { by: mode, partition } : mode) : undefined,
    });
  }

  function applyBulk(provider: Provider, isAllowed: boolean) {
    updatePreference(provider, (draft) => {
      const selectedIds = Object.entries(draft.models)
        .filter(([, item]) => item.selected)
        .map(([modelId]) => modelId);
      if (selectedIds.length === 0) {
        return draft;
      }
      const nextModels = { ...draft.models };
      for (const modelId of selectedIds) {
        nextModels[modelId] = { ...nextModels[modelId], isAllowed };
      }
      let defaultModelId = draft.defaultModelId;
      if (!isAllowed && selectedIds.includes(defaultModelId)) {
        defaultModelId = "";
      }
      if (isAllowed && !defaultModelId) {
        defaultModelId = selectedIds[0];
      }
      return { ...draft, defaultModelId, models: nextModels };
    });
  }

  function selectModels(provider: Provider, modelIds: string[]) {
    const modelIdSet = new Set(modelIds);
    updatePreference(provider, (draft) => ({
      ...draft,
      models: Object.fromEntries(
        Object.entries(draft.models).map(([modelId, item]) => [
          modelId,
          { ...item, selected: modelIdSet.has(modelId) },
        ]),
      ),
    }));
  }

  function clearSelection(provider: Provider) {
    updatePreference(provider, (draft) => ({
      ...draft,
      models: Object.fromEntries(
        Object.entries(draft.models).map(([modelId, item]) => [
          modelId,
          { ...item, selected: false },
        ]),
      ),
    }));
  }

  async function submitProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    const payload: ProviderCreatePayload = {
      type: form.type,
      name: form.name.trim(),
      base_url: form.baseUrl.trim(),
      api_key: form.apiKey.trim() || undefined,
      is_local: form.isLocal,
      streaming_enabled: form.streamingEnabled,
      models_path: form.modelsPath.trim(),
      chat_path: form.chatPath.trim(),
    };

    try {
      const provider = await createProvider(payload);
      setNotice(`${provider.name}: провайдер сохранен`);
      setForm(selectedDefault ? formFromDefaults(selectedDefault) : initialForm);
      await loadProviderState();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить провайдера");
    } finally {
      setSaving(false);
    }
  }

  async function saveModelPreferences(provider: Provider) {
    const draft = modelPreferences[provider.id] ?? preferenceFromProvider(provider);
    const allowedCount = provider.models.filter(
      (model) => draft.models[model.model_id]?.isAllowed,
    ).length;
    if (draft.defaultModelId && !draft.models[draft.defaultModelId]?.isAllowed) {
      setError("Default model must be allowed.");
      return;
    }
    if (allowedCount === 0 && draft.defaultModelId) {
      setError("Default model must be allowed.");
      return;
    }

    const payload: ProviderModelPreferencesUpdatePayload = {
      default_model_id: draft.defaultModelId || null,
      models: provider.models.map((model) => {
        const preference = draft.models[model.model_id];
        return {
          model_id: model.model_id,
          is_allowed: Boolean(preference?.isAllowed),
          routing_config:
            provider.type === "openrouter"
              ? cleanRoutingConfig(preference?.routingConfig)
              : null,
        };
      }),
    };

    setBusyProviderId(provider.id);
    setError(undefined);
    setNotice(undefined);
    try {
      await updateProviderModelPreferences(provider.id, payload);
      setNotice(`${provider.name}: модели сохранены`);
      await loadProviderState();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить модели");
    } finally {
      setBusyProviderId(undefined);
    }
  }

  async function runProviderAction(
    provider: Provider,
    action: "test" | "refresh" | "toggle" | "default" | "delete",
  ) {
    setBusyProviderId(provider.id);
    setError(undefined);
    setNotice(undefined);
    try {
      if (action === "test") {
        const result = await testProvider(provider.id);
        setNotice(`${provider.name}: ${result.message}, ${result.latency_ms} мс`);
      }
      if (action === "refresh") {
        const result = await refreshProviderModels(provider.id);
        setNotice(`${provider.name}: ${result.message}`);
      }
      if (action === "toggle") {
        const nextEnabled = !provider.is_enabled;
        await updateProvider(provider.id, { is_enabled: nextEnabled });
        setNotice(`${provider.name}: ${nextEnabled ? "провайдер включен" : "провайдер отключен"}`);
      }
      if (action === "default") {
        await setDefaultProvider(provider.id);
        setNotice(`${provider.name}: провайдер по умолчанию`);
      }
      if (action === "delete") {
        if (!window.confirm(`Удалить провайдера "${provider.name}"? Проекты потеряют ссылку на него.`)) {
          return;
        }
        await deleteProvider(provider.id);
        setNotice(`${provider.name}: провайдер удален`);
      }
      await loadProviderState();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Действие не выполнено");
    } finally {
      setBusyProviderId(undefined);
    }
  }

  function renderRoutingEditor(
    provider: Provider,
    model: ProviderModel,
    preference: ModelPreferenceDraft,
  ) {
    const config = preference.routingConfig || {};
    const warnings = routingWarnings(config);
    const preview = cleanRoutingConfig(config);
    const selectedQuantizations = config.quantizations || [];

    return (
      <div className="provider-routing">
        {warnings.length > 0 && (
          <div className="provider-routing__warnings">
            {warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        )}
        <div className="provider-routing__grid">
          <label className="provider-routing__list-field">
            Order
            <textarea
              rows={3}
              placeholder={"google-vertex\nopenai\nanthropic"}
              value={routingListValue(preference, "order", config)}
              onChange={(event) =>
                updateRoutingList(provider, model.model_id, "order", event.target.value)
              }
            />
          </label>
          <label className="provider-routing__list-field">
            Only
            <textarea
              rows={3}
              placeholder={"google-vertex\nopenai\nanthropic"}
              value={routingListValue(preference, "only", config)}
              onChange={(event) =>
                updateRoutingList(provider, model.model_id, "only", event.target.value)
              }
            />
          </label>
          <label className="provider-routing__list-field">
            Ignore
            <textarea
              rows={3}
              placeholder={"openai\nanthropic"}
              value={routingListValue(preference, "ignore", config)}
              onChange={(event) =>
                updateRoutingList(provider, model.model_id, "ignore", event.target.value)
              }
            />
          </label>
          <label>
            Sort
            <select
              value={sortMode(config)}
              onChange={(event) =>
                updateSort(provider, model.model_id, event.target.value as OpenRouterSortMode | "")
              }
            >
              <option value="">Default</option>
              <option value="price">Price</option>
              <option value="throughput">Throughput</option>
              <option value="latency">Latency</option>
            </select>
          </label>
          <label>
            Sort partition
            <select
              value={sortPartition(config)}
              onChange={(event) =>
                updateSortPartition(
                  provider,
                  model.model_id,
                  event.target.value as "model" | "none" | "",
                )
              }
              disabled={!sortMode(config)}
            >
              <option value="">Default</option>
              <option value="model">Model</option>
              <option value="none">None</option>
            </select>
          </label>
          <label>
            Max prompt price
            <input
              inputMode="decimal"
              value={config.max_price?.prompt ?? ""}
              onChange={(event) =>
                updateRouting(provider, model.model_id, {
                  max_price: {
                    ...config.max_price,
                    prompt: numberOrUndefined(event.target.value),
                  },
                })
              }
            />
          </label>
          <label>
            Max completion price
            <input
              inputMode="decimal"
              value={config.max_price?.completion ?? ""}
              onChange={(event) =>
                updateRouting(provider, model.model_id, {
                  max_price: {
                    ...config.max_price,
                    completion: numberOrUndefined(event.target.value),
                  },
                })
              }
            />
          </label>
          <label>
            Min throughput p90
            <input
              inputMode="decimal"
              value={percentileValue(config.preferred_min_throughput)}
              onChange={(event) => {
                const value = numberOrUndefined(event.target.value);
                updateRouting(provider, model.model_id, {
                  preferred_min_throughput: value === undefined ? undefined : { p90: value },
                });
              }}
            />
          </label>
          <label>
            Max latency p90
            <input
              inputMode="decimal"
              value={percentileValue(config.preferred_max_latency)}
              onChange={(event) => {
                const value = numberOrUndefined(event.target.value);
                updateRouting(provider, model.model_id, {
                  preferred_max_latency: value === undefined ? undefined : { p90: value },
                });
              }}
            />
          </label>
        </div>
        <div className="provider-routing__toggles">
          <label>
            <input
              type="checkbox"
              checked={config.allow_fallbacks ?? true}
              onChange={(event) =>
                updateRouting(provider, model.model_id, {
                  allow_fallbacks: event.target.checked,
                })
              }
            />
            Fallbacks
          </label>
          <label>
            <input
              type="checkbox"
              checked={Boolean(config.require_parameters)}
              onChange={(event) =>
                updateRouting(provider, model.model_id, {
                  require_parameters: event.target.checked,
                })
              }
            />
            Require parameters
          </label>
          <label>
            <input
              type="checkbox"
              checked={Boolean(config.zdr)}
              onChange={(event) => updateRouting(provider, model.model_id, { zdr: event.target.checked })}
            />
            ZDR
          </label>
          <label>
            <input
              type="checkbox"
              checked={Boolean(config.enforce_distillable_text)}
              onChange={(event) =>
                updateRouting(provider, model.model_id, {
                  enforce_distillable_text: event.target.checked,
                })
              }
            />
            Distillable text
          </label>
        </div>
        <div className="provider-routing__segmented" aria-label="Data collection">
          <button
            type="button"
            aria-pressed={config.data_collection === "allow"}
            onClick={() => updateRouting(provider, model.model_id, { data_collection: "allow" })}
          >
            Allow data
          </button>
          <button
            type="button"
            aria-pressed={config.data_collection === "deny"}
            onClick={() => updateRouting(provider, model.model_id, { data_collection: "deny" })}
          >
            Deny data
          </button>
          <button
            type="button"
            aria-pressed={!config.data_collection}
            onClick={() => updateRouting(provider, model.model_id, { data_collection: undefined })}
          >
            Default
          </button>
        </div>
        <div className="provider-routing__chips" aria-label="Quantizations">
          {quantizationOptions.map((quantization) => (
            <label key={quantization}>
              <input
                type="checkbox"
                checked={selectedQuantizations.includes(quantization)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...selectedQuantizations, quantization]
                    : selectedQuantizations.filter((item) => item !== quantization);
                  updateRouting(provider, model.model_id, { quantizations: next });
                }}
              />
              {quantization}
            </label>
          ))}
        </div>
        <pre className="provider-routing__preview">
          {JSON.stringify(preview || {}, null, 2)}
        </pre>
      </div>
    );
  }

  return (
    <AppShell currentPath="/settings/providers">
      <div className="provider-route">
        <header className="provider-route__header">
          <div>
            <p className="provider-route__eyebrow">MVP · этап 2</p>
            <h1>AI-провайдеры</h1>
          </div>
          <div className="provider-route__summary" aria-label="Сводка провайдеров">
            <span>
              <ServerCog size={16} aria-hidden="true" />
              {providers.length}
            </span>
            <span>
              <Cloud size={16} aria-hidden="true" />
              {providers.filter((provider) => provider.is_external).length}
            </span>
            <span>
              <CheckCircle2 size={16} aria-hidden="true" />
              {providers.filter((provider) => provider.is_enabled).length}
            </span>
          </div>
        </header>

        {(error || notice) && (
          <div className={`provider-route__message ${error ? "is-error" : "is-ready"}`}>
            {error || notice}
          </div>
        )}

        <section className="provider-route__layout">
          <form className="provider-form" onSubmit={submitProvider}>
            <div className="provider-form__title">
              <PlugZap size={18} aria-hidden="true" />
              <h2>Новый провайдер</h2>
            </div>

            <label>
              Тип
              <select
                id="provider-type"
                name="provider-type"
                value={form.type}
                onChange={(event) => updateType(event.target.value as ProviderType)}
              >
                {defaults.map((item) => (
                  <option key={item.type} value={item.type}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Название
              <input
                id="provider-name"
                name="provider-name"
                autoComplete="off"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </label>

            <label>
              Base URL
              <input
                id="provider-base-url"
                name="provider-base-url"
                autoComplete="off"
                value={form.baseUrl}
                onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
              />
            </label>

            <div className="provider-form__paths">
              <label>
                Models path
                <input
                  id="provider-models-path"
                  name="provider-models-path"
                  autoComplete="off"
                  value={form.modelsPath}
                  onChange={(event) => setForm({ ...form, modelsPath: event.target.value })}
                />
              </label>
              <label>
                Chat path
                <input
                  id="provider-chat-path"
                  name="provider-chat-path"
                  autoComplete="off"
                  value={form.chatPath}
                  onChange={(event) => setForm({ ...form, chatPath: event.target.value })}
                />
              </label>
            </div>

            <label>
              API key
              <span className="provider-form__secret">
                <KeyRound size={16} aria-hidden="true" />
                <input
                  id="provider-api-key"
                  name="provider-api-key"
                  type="password"
                  autoComplete="current-password"
                  value={form.apiKey}
                  onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
                  placeholder={selectedDefault?.requires_api_key ? "Required" : "Optional"}
                />
              </span>
            </label>

            <div className="provider-form__toggles">
              <label>
                <input
                  type="checkbox"
                  id="provider-is-local"
                  name="provider-is-local"
                  checked={form.isLocal}
                  onChange={(event) => setForm({ ...form, isLocal: event.target.checked })}
                />
                Локальный
              </label>
              <label>
                <input
                  type="checkbox"
                  id="provider-streaming"
                  name="provider-streaming"
                  checked={form.streamingEnabled}
                  onChange={(event) => setForm({ ...form, streamingEnabled: event.target.checked })}
                />
                Streaming
              </label>
            </div>

            <button className="provider-route__button is-primary" disabled={saving || !form.name.trim()}>
              <Save size={16} aria-hidden="true" />
              {saving ? "Сохранение" : "Сохранить"}
            </button>
          </form>

          <section className="provider-list" aria-label="Настроенные провайдеры">
            {loading && <div className="provider-route__empty">Загрузка</div>}
            {!loading && providers.length === 0 && <div className="provider-route__empty">Провайдеров нет</div>}

            {providers.map((provider) => {
              const preference = modelPreferences[provider.id] ?? preferenceFromProvider(provider);
              const allowedCount = provider.models.filter(
                (model) => preference.models[model.model_id]?.isAllowed,
              ).length;
              const selectedCount = Object.values(preference.models).filter((item) => item.selected).length;
              const visibleModels = provider.models
                .filter((model) => {
                  const modelPreference = preference.models[model.model_id];
                  return (
                    modelMatchesQuery(model, preference.query) &&
                    (!preference.allowedOnly || Boolean(modelPreference?.isAllowed))
                  );
                })
                .sort((left, right) => compareModelsByPreference(left, right, preference));

              return (
                <article
                  className={`provider-card ${provider.is_enabled ? "" : "is-disabled"}`}
                  key={provider.id}
                >
                  <div className="provider-card__header">
                    <div className="provider-card__icon">{providerIcon(provider)}</div>
                    <div>
                      <h2>{provider.name}</h2>
                      <p>{provider.base_url}</p>
                    </div>
                    <div className="provider-card__badges">
                      {provider.is_default && (
                        <span className="provider-card__scope is-default">
                          <Star size={14} aria-hidden="true" />
                          Основной
                        </span>
                      )}
                      <span className={`provider-card__scope ${provider.is_external ? "is-external" : "is-local"}`}>
                        {providerScopeLabel(provider)}
                      </span>
                    </div>
                  </div>

                  <div className="provider-card__meta">
                    <span>{provider.type}</span>
                    <span>{provider.is_enabled ? "enabled" : "disabled"}</span>
                    <span>{provider.streaming_enabled ? "streaming" : "single response"}</span>
                    <span>{provider.has_api_key ? "key saved" : "no key"}</span>
                    <span>{provider.last_checked_at ? "checked" : "not checked"}</span>
                    <span>{provider.models.length} discovered</span>
                    <span>{allowedCount} allowed</span>
                    <span>{preference.defaultModelId ? "default set" : "no default"}</span>
                  </div>

                  <div className="provider-model-panel">
                    <div className="provider-model-panel__tools">
                      <label className="provider-model-panel__search">
                        <Search size={16} aria-hidden="true" />
                        <input
                          value={preference.query}
                          onChange={(event) =>
                            updatePreference(provider, (draft) => ({
                              ...draft,
                              query: event.target.value,
                            }))
                          }
                          placeholder="Search models"
                        />
                      </label>
                      <div className="provider-model-panel__filters">
                        <button
                          type="button"
                          aria-pressed={!preference.allowedOnly}
                          onClick={() =>
                            updatePreference(provider, (draft) => ({ ...draft, allowedOnly: false }))
                          }
                        >
                          All models
                        </button>
                        <button
                          type="button"
                          aria-pressed={preference.allowedOnly}
                          onClick={() =>
                            updatePreference(provider, (draft) => ({ ...draft, allowedOnly: true }))
                          }
                        >
                          Allowed only
                        </button>
                      </div>
                    </div>

                    <div className="provider-model-panel__bulk">
                      <button
                        type="button"
                        disabled={provider.models.length === 0}
                        onClick={() =>
                          selectModels(
                            provider,
                            provider.models.map((model) => model.model_id),
                          )
                        }
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        disabled={visibleModels.length === 0}
                        onClick={() =>
                          selectModels(
                            provider,
                            visibleModels.map((model) => model.model_id),
                          )
                        }
                      >
                        Select shown
                      </button>
                      <button
                        type="button"
                        disabled={selectedCount === 0}
                        onClick={() => applyBulk(provider, true)}
                      >
                        Allow selected
                      </button>
                      <button
                        type="button"
                        disabled={selectedCount === 0}
                        onClick={() => applyBulk(provider, false)}
                      >
                        Disallow selected
                      </button>
                      <button
                        type="button"
                        disabled={selectedCount === 0}
                        onClick={() => clearSelection(provider)}
                      >
                        Clear selection
                      </button>
                    </div>

                    {allowedCount > 0 && !preference.defaultModelId && (
                      <p className="provider-model-panel__warning">Choose a default model or save with no default.</p>
                    )}

                    <div className="provider-model-list">
                      {visibleModels.map((model) => {
                        const modelPreference = preference.models[model.model_id];
                        if (!modelPreference) {
                          return null;
                        }
                        const isDefault = preference.defaultModelId === model.model_id;
                        const metadata = modelMetadataItems(model);
                        return (
                          <div className="provider-model-row" key={model.id}>
                            <div className="provider-model-row__main">
                              <label className="provider-model-row__select">
                                <input
                                  type="checkbox"
                                  checked={modelPreference.selected}
                                  onChange={(event) =>
                                    updateModelPreference(provider, model.model_id, {
                                      selected: event.target.checked,
                                    })
                                  }
                                />
                              </label>
                              <label className="provider-model-row__allow">
                                <input
                                  type="checkbox"
                                  checked={modelPreference.isAllowed}
                                  onChange={(event) =>
                                    updateModelPreference(provider, model.model_id, {
                                      isAllowed: event.target.checked,
                                    })
                                  }
                                />
                                Allowed
                              </label>
                              <button
                                className={`provider-model-row__default ${isDefault ? "is-default" : ""}`}
                                type="button"
                                disabled={!modelPreference.isAllowed}
                                onClick={() =>
                                  updatePreference(provider, (draft) => ({
                                    ...draft,
                                    defaultModelId: model.model_id,
                                  }))
                                }
                                title="Set default model"
                              >
                                <Star size={16} aria-hidden="true" />
                              </button>
                              <div className="provider-model-row__name">
                                <strong>{model.display_name}</strong>
                                <span>{model.model_id}</span>
                              </div>
                              {provider.type === "openrouter" && (
                                <button
                                  className="provider-model-row__routing"
                                  type="button"
                                  onClick={() =>
                                    updateModelPreference(provider, model.model_id, {
                                      expanded: !modelPreference.expanded,
                                    })
                                  }
                                >
                                  <Settings2 size={16} aria-hidden="true" />
                                  Routing
                                  <ChevronDown size={16} aria-hidden="true" />
                                </button>
                              )}
                            </div>
                            {metadata.length > 0 && (
                              <dl className="provider-model-row__metadata">
                                {metadata.map((item) => {
                                  const Icon = item.icon;
                                  return (
                                  <div
                                    key={item.label}
                                    aria-label={`${item.label}: ${item.value}. ${item.tooltip}`}
                                    title={item.tooltip}
                                  >
                                    <Icon size={14} aria-hidden="true" />
                                    <dt>{item.label}</dt>
                                    <dd>{item.value}</dd>
                                  </div>
                                  );
                                })}
                              </dl>
                            )}
                            {provider.type === "openrouter" && modelPreference.expanded && (
                              renderRoutingEditor(provider, model, modelPreference)
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="provider-card__actions">
                    <button
                      className="provider-route__button is-primary"
                      type="button"
                      disabled={busyProviderId === provider.id || !provider.is_enabled}
                      onClick={() => void saveModelPreferences(provider)}
                      title="Сохранить модели"
                    >
                      <Save size={16} aria-hidden="true" />
                      Save models
                    </button>
                    <button
                      className="provider-route__button"
                      type="button"
                      disabled={busyProviderId === provider.id}
                      onClick={() => void runProviderAction(provider, "toggle")}
                      title={provider.is_enabled ? "Отключить провайдера" : "Включить провайдера"}
                    >
                      {provider.is_enabled ? (
                        <PowerOff size={16} aria-hidden="true" />
                      ) : (
                        <Power size={16} aria-hidden="true" />
                      )}
                      {provider.is_enabled ? "Отключить" : "Включить"}
                    </button>
                    <button
                      className="provider-route__button"
                      type="button"
                      disabled={busyProviderId === provider.id || !provider.is_enabled || provider.is_default}
                      onClick={() => void runProviderAction(provider, "default")}
                      title="Сделать провайдером по умолчанию"
                    >
                      <Star size={16} aria-hidden="true" />
                      Основной
                    </button>
                    <button
                      className="provider-route__button"
                      type="button"
                      disabled={busyProviderId === provider.id || !provider.is_enabled}
                      onClick={() => void runProviderAction(provider, "test")}
                      title="Проверить подключение"
                    >
                      <PlugZap size={16} aria-hidden="true" />
                      Проверить
                    </button>
                    <button
                      className="provider-route__button"
                      type="button"
                      disabled={busyProviderId === provider.id || !provider.is_enabled}
                      onClick={() => void runProviderAction(provider, "refresh")}
                      title="Обновить список моделей"
                    >
                      <RefreshCw size={16} aria-hidden="true" />
                      Модели
                    </button>
                    <button
                      className="provider-route__button is-danger"
                      type="button"
                      disabled={busyProviderId === provider.id}
                      onClick={() => void runProviderAction(provider, "delete")}
                      title="Удалить провайдера"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      Удалить
                    </button>
                  </div>

                  {provider.last_error && <p className="provider-card__error">{provider.last_error}</p>}
                </article>
              );
            })}
          </section>
        </section>
      </div>
    </AppShell>
  );
}
