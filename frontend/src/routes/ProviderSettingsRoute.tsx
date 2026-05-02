import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Cloud,
  KeyRound,
  Monitor,
  PlugZap,
  RefreshCw,
  Save,
  ServerCog,
} from "lucide-react";

import {
  createProvider,
  fetchProviderDefaults,
  fetchProviders,
  providerScopeLabel,
  refreshProviderModels,
  setProviderDefaultModel,
  testProvider,
} from "../api/providers";
import { AppShell } from "../components/templates/AppShell";
import type { Provider, ProviderCreatePayload, ProviderDefaults, ProviderType } from "../types/providers";
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

function buildModelSelections(
  providers: Provider[],
  current: Record<string, string>,
): Record<string, string> {
  const next = { ...current };
  for (const provider of providers) {
    next[provider.id] = next[provider.id] || provider.default_model_id || provider.models[0]?.model_id || "";
  }
  return next;
}

async function fetchProviderState() {
  return Promise.all([fetchProviderDefaults(), fetchProviders()]);
}

export function ProviderSettingsRoute() {
  const [defaults, setDefaults] = useState<ProviderDefaults[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [form, setForm] = useState<ProviderFormState>(initialForm);
  const [selectedModels, setSelectedModels] = useState<Record<string, string>>({});
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
      setSelectedModels((current) => buildModelSelections(nextProviders, current));
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
        setSelectedModels((current) => buildModelSelections(nextProviders, current));
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

  async function runProviderAction(provider: Provider, action: "test" | "refresh" | "save") {
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
      if (action === "save") {
        const modelId = selectedModels[provider.id] || null;
        await setProviderDefaultModel(provider.id, modelId);
        setNotice(`${provider.name}: модель выбрана`);
      }
      await loadProviderState();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Действие не выполнено");
    } finally {
      setBusyProviderId(undefined);
    }
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
              {providers.filter((provider) => provider.default_model_id).length}
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

            {providers.map((provider) => (
              <article className="provider-card" key={provider.id}>
                <div className="provider-card__header">
                  <div className="provider-card__icon">{providerIcon(provider)}</div>
                  <div>
                    <h2>{provider.name}</h2>
                    <p>{provider.base_url}</p>
                  </div>
                  <span className={`provider-card__scope ${provider.is_external ? "is-external" : "is-local"}`}>
                    {providerScopeLabel(provider)}
                  </span>
                </div>

                <div className="provider-card__meta">
                  <span>{provider.type}</span>
                  <span>{provider.streaming_enabled ? "streaming" : "single response"}</span>
                  <span>{provider.has_api_key ? "key saved" : "no key"}</span>
                  <span>{provider.last_checked_at ? "checked" : "not checked"}</span>
                </div>

                <div className="provider-card__model-row">
                  <label>
                    Модель для проекта
                    <select
                      id={`provider-model-${provider.id}`}
                      name={`provider-model-${provider.id}`}
                      value={selectedModels[provider.id] || ""}
                      onChange={(event) =>
                        setSelectedModels({ ...selectedModels, [provider.id]: event.target.value })
                      }
                    >
                      <option value="">Не выбрана</option>
                      {provider.models.map((model) => (
                        <option key={model.id} value={model.model_id}>
                          {model.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="provider-route__button"
                    type="button"
                    disabled={busyProviderId === provider.id}
                    onClick={() => void runProviderAction(provider, "save")}
                    title="Сохранить модель"
                  >
                    <Save size={16} aria-hidden="true" />
                    Выбрать
                  </button>
                </div>

                <div className="provider-card__actions">
                  <button
                    className="provider-route__button"
                    type="button"
                    disabled={busyProviderId === provider.id}
                    onClick={() => void runProviderAction(provider, "test")}
                    title="Проверить подключение"
                  >
                    <PlugZap size={16} aria-hidden="true" />
                    Проверить
                  </button>
                  <button
                    className="provider-route__button"
                    type="button"
                    disabled={busyProviderId === provider.id}
                    onClick={() => void runProviderAction(provider, "refresh")}
                    title="Обновить список моделей"
                  >
                    <RefreshCw size={16} aria-hidden="true" />
                    Модели
                  </button>
                </div>

                {provider.last_error && <p className="provider-card__error">{provider.last_error}</p>}
              </article>
            ))}
          </section>
        </section>
      </div>
    </AppShell>
  );
}
