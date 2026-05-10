import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, PlugZap, Save, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  allowedModels,
  providerQueries,
  selectableAiProviders,
} from "../../provider";
import { memoryQueryKeys } from "../../memory";
import { projectQueryKeys } from "../../project";
import { runtimeQueryKeys } from "../../runtime";
import { NoticeBlock } from "../../../shared/ui";
import {
  defaultAllowedModel,
  modelById,
  providerById,
  topPEnabled,
} from "../model/project-ai-settings-helpers";
import { projectAiSettingsMutations } from "../model/project-ai-settings-mutations";
import { projectAiSettingsQueries } from "../model/project-ai-settings-queries";
import { projectAiSettingsQueryKeys } from "../model/project-ai-settings-query-keys";
import "./ProjectAssistantModelSettingsModal.css";

type ProjectAssistantModelSettingsModalProps = {
  onClose: () => void;
  open: boolean;
  projectId: string;
};

export function ProjectAssistantModelSettingsModal({
  onClose,
  open,
  projectId,
}: ProjectAssistantModelSettingsModalProps) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery(projectAiSettingsQueries.detail(projectId));
  const providersQuery = useQuery(providerQueries.list());
  const updateMutation = useMutation({
    ...projectAiSettingsMutations.update(projectId),
    onSuccess: (settings) => {
      queryClient.setQueryData(projectAiSettingsQueryKeys.detail(projectId), settings);
      void queryClient.invalidateQueries({ queryKey: projectQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: runtimeQueryKeys.status });
      void queryClient.invalidateQueries({ queryKey: memoryQueryKeys.all });
      onClose();
    },
  });
  const settings = settingsQuery.data;
  const providers = useMemo(
    () => (Array.isArray(providersQuery.data) ? providersQuery.data : []),
    [providersQuery.data],
  );
  const selectableProviders = useMemo(() => selectableAiProviders(providers), [providers]);
  const [providerId, setProviderId] = useState("");
  const [modelId, setModelId] = useState("");
  const [defaultTemperature, setDefaultTemperature] = useState(0.7);
  const [defaultTopP, setDefaultTopP] = useState(0.9);

  const selectedProvider = providerById(providers, providerId || null);
  const selectedModels = useMemo(() => allowedModels(selectedProvider), [selectedProvider]);
  const selectedModel =
    modelById(selectedProvider, modelId || null) || defaultAllowedModel(selectedProvider);
  const selectedModelSupportsTopP = topPEnabled(selectedModel);

  useEffect(() => {
    if (!open || !settings) {
      return;
    }
    const nextProvider = providerById(providers, settings.active_provider_id);
    const fallbackProvider = nextProvider || selectableProviders[0];
    const nextModel =
      modelById(nextProvider, settings.active_model_id) ||
      defaultAllowedModel(fallbackProvider);
    setProviderId(fallbackProvider?.id || "");
    setModelId(nextModel?.model_id || "");
    setDefaultTemperature(settings.default_temperature);
    setDefaultTopP(settings.default_top_p);
  }, [open, providers, selectableProviders, settings]);

  if (!open) {
    return null;
  }

  function saveSettings() {
    if (!settings) {
      return;
    }
    updateMutation.mutate({
      active_provider_id: providerId || null,
      active_model_id: modelId || null,
      default_temperature: defaultTemperature,
      default_top_p: defaultTopP,
    });
  }

  function changeProvider(nextProviderId: string) {
    const nextProvider = providerById(providers, nextProviderId);
    setProviderId(nextProviderId);
    setModelId(defaultAllowedModel(nextProvider)?.model_id || "");
  }

  const loading = settingsQuery.isPending || providersQuery.isPending;
  const errors = [settingsQuery.error, providersQuery.error, updateMutation.error]
    .filter((error): error is Error => error instanceof Error)
    .map((error) => error.message);

  return (
    <div className="project-ai-modal__backdrop" role="presentation">
      <section
        aria-labelledby="project-ai-modal-title"
        aria-modal="true"
        className="project-ai-modal"
        role="dialog"
      >
        <header className="project-ai-modal__header">
          <div>
            <SlidersHorizontal size={20} aria-hidden="true" />
            <h2 id="project-ai-modal-title">Модель ассистента</h2>
          </div>
          <button aria-label="Закрыть" onClick={onClose} type="button">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {loading && (
          <div className="project-ai-modal__loading" role="status">
            <LoaderCircle className="is-spinning" size={18} aria-hidden="true" />
            <span>Загрузка</span>
          </div>
        )}
        {errors.map((error) => (
          <NoticeBlock key={error} tone="error">
            {error}
          </NoticeBlock>
        ))}
        {settings?.warnings.map((warning) => (
          <NoticeBlock key={warning}>{warning}</NoticeBlock>
        ))}

        {settings && (
          <div className="project-ai-modal__body">
            <section className="project-ai-modal__section" aria-label="Настройки проекта">
              <div className="project-ai-modal__section-title">
                <h3>Проект</h3>
                <Link title="Настройки провайдеров" to="/settings/providers">
                  <PlugZap size={16} aria-hidden="true" />
                </Link>
              </div>
              <div className="project-ai-modal__grid">
                <label>
                  <span>Провайдер</span>
                  <select
                    disabled={updateMutation.isPending}
                    name="project-ai-provider"
                    onChange={(event) => changeProvider(event.target.value)}
                    value={providerId}
                  >
                    {selectableProviders.length === 0 && <option value="">Нет доступных</option>}
                    {selectableProviders.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Модель</span>
                  <select
                    disabled={!selectedProvider || updateMutation.isPending}
                    name="project-ai-model"
                    onChange={(event) => setModelId(event.target.value)}
                    value={modelId}
                  >
                    {selectedModels.length === 0 && <option value="">Нет разрешенных</option>}
                    {selectedModels.map((model) => (
                      <option key={model.id} value={model.model_id}>
                        {model.display_name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="project-ai-modal__range-grid">
                <RangeField
                  label="Температура"
                  max={2}
                  min={0}
                  name="project-ai-default-temperature"
                  onChange={setDefaultTemperature}
                  step={0.05}
                  value={defaultTemperature}
                />
                <RangeField
                  disabled={!selectedModelSupportsTopP}
                  label="Top P"
                  max={1}
                  min={0}
                  name="project-ai-default-top-p"
                  onChange={setDefaultTopP}
                  step={0.05}
                  value={defaultTopP}
                />
              </div>
            </section>
          </div>
        )}

        <footer className="project-ai-modal__footer">
          <button disabled={updateMutation.isPending} onClick={onClose} type="button">
            Отмена
          </button>
          <button disabled={!settings || updateMutation.isPending} onClick={saveSettings} type="button">
            {updateMutation.isPending ? (
              <LoaderCircle className="is-spinning" size={16} aria-hidden="true" />
            ) : (
              <Save size={16} aria-hidden="true" />
            )}
            Сохранить
          </button>
        </footer>
      </section>
    </div>
  );
}

function RangeField({
  disabled,
  label,
  max,
  min,
  name,
  onChange,
  step,
  value,
}: {
  disabled?: boolean;
  label: string;
  max: number;
  min: number;
  name: string;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  return (
    <label className="project-ai-range">
      {label && <span>{label}</span>}
      <input
        disabled={disabled}
        max={max}
        min={min}
        name={name}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
      <output>{value.toFixed(2)}</output>
    </label>
  );
}
