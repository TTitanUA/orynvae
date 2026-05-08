import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, ChevronLeft, LoaderCircle, PlugZap, Save, Sparkles } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { memoryQueries, memoryQueryKeys } from "../../../entities/memory";
import { allowedModels, providerQueries, type Provider, type ProviderModel } from "../../../entities/provider";
import {
  createStoryLine,
  storyLineQueries,
  storyLineQueryKeys,
  storyLineStatusLabel,
  storyLineStatusOptions,
  storyLineTypeOptions,
  suggestStoryLines,
  updateStoryLine,
  type StoryLine,
  type StoryLineReasoningEffort,
  type StoryLineStatus,
  type StoryLineSuggestion,
  type StoryLineType,
} from "../../../entities/story-line";
import { NoticeBlock, StatusPill } from "../../../shared/ui";
import { AppShell } from "../../../widgets/app-shell";
import "./StoryLineDetailRoute.css";

type StoryLineDetailRouteProps = {
  projectId: string;
  lineId?: string;
};

type StoryLineDraft = {
  type: StoryLineType;
  title: string;
  description: string;
  current_state: string;
  status: StoryLineStatus;
  priority: number;
};

type Option<T extends string> = {
  value: T;
  label: string;
};

const emptyDraft: StoryLineDraft = {
  type: "custom",
  title: "",
  description: "",
  current_state: "",
  status: "proposed",
  priority: 0,
};

const reasoningEffortOptions: Option<StoryLineReasoningEffort>[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

function supportedParameters(model: ProviderModel | undefined): string[] {
  const capabilities = model?.capabilities;
  const value =
    capabilities && typeof capabilities === "object"
      ? capabilities.supported_parameters
      : undefined;
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map((item) => item.toLowerCase());
}

function supportsParameter(model: ProviderModel | undefined, parameter: string): boolean {
  const parameters = supportedParameters(model);
  return parameters.length === 0 || parameters.includes(parameter);
}

function supportsReasoning(model: ProviderModel | undefined): boolean {
  const parameters = supportedParameters(model);
  return (
    parameters.includes("reasoning") ||
    parameters.includes("reasoning_effort") ||
    parameters.includes("reasoning.effort")
  );
}

function selectableStoryProviders(providers: Provider[]): Provider[] {
  return providers.filter(
    (provider) => provider.is_enabled && !provider.last_error && allowedModels(provider).length > 0,
  );
}

function lineToDraft(line: StoryLine): StoryLineDraft {
  return {
    type: line.type,
    title: line.title,
    description: line.description || "",
    current_state: line.current_state || "",
    status: line.status,
    priority: line.priority,
  };
}

function suggestionToDraft(suggestion: StoryLineSuggestion): StoryLineDraft {
  return {
    type: suggestion.type,
    title: suggestion.title,
    description: suggestion.description || suggestion.reason || "",
    current_state: suggestion.current_state || "",
    status: "proposed",
    priority: suggestion.priority,
  };
}

function assistantInstructionsForMode(
  instructions: string,
  draft: StoryLineDraft,
  isCreate: boolean,
): string | null {
  const trimmedInstructions = instructions.trim();
  if (isCreate) {
    return trimmedInstructions || null;
  }

  return [
    "Помоги отредактировать существующую линию истории.",
    "Верни одну улучшенную версию этой же линии, а не новую отдельную линию.",
    `Тип: ${draft.type}`,
    `Статус: ${draft.status}`,
    `Приоритет: ${draft.priority}`,
    `Название: ${draft.title || "(пусто)"}`,
    `Описание: ${draft.description || "(пусто)"}`,
    `Текущее состояние: ${draft.current_state || "(пусто)"}`,
    trimmedInstructions
      ? `Задача пользователя: ${trimmedInstructions}`
      : "Задача пользователя: улучшить фокус, ясность и актуальное состояние линии.",
  ].join("\n");
}

function draftToPayload(draft: StoryLineDraft) {
  return {
    type: draft.type,
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    current_state: draft.current_state.trim() || null,
    status: draft.status,
    priority: draft.priority,
  };
}

function mutationErrorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

export function StoryLineDetailRoute({ projectId, lineId }: StoryLineDetailRouteProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isCreate = !lineId;
  const [createDraft, setCreateDraft] = useState<StoryLineDraft>(emptyDraft);
  const [draftOverrides, setDraftOverrides] = useState<Partial<StoryLineDraft>>({});
  const [assistantInstructions, setAssistantInstructions] = useState("");
  const [assistantMessage, setAssistantMessage] = useState<string | null>(null);
  const [selectedProviderIdDraft, setSelectedProviderId] = useState("");
  const [selectedModelIdDraft, setSelectedModelId] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(0.9);
  const [reasoningEffort, setReasoningEffort] = useState<StoryLineReasoningEffort | "">("");

  const summaryQuery = useQuery(memoryQueries.workspaceSummary(projectId));
  const providersQuery = useQuery(providerQueries.list());
  const lineQuery = useQuery(storyLineQueries.detail(projectId, lineId || null));
  const progressQuery = useQuery(storyLineQueries.progress(projectId, lineId || null));

  const summary = summaryQuery.data;
  const line = lineQuery.data;
  const readOnly = Boolean(summary?.runtime.read_only);
  const providers = useMemo(
    () => (Array.isArray(providersQuery.data) ? providersQuery.data : []),
    [providersQuery.data],
  );
  const selectableProviders = useMemo(() => selectableStoryProviders(providers), [providers]);
  const projectProvider = selectableProviders.find(
    (provider) => provider.id === summary?.project.active_provider_id,
  );
  const defaultProvider = selectableProviders.find((provider) => provider.is_default);
  const selectedProviderId =
    selectedProviderIdDraft || (projectProvider || defaultProvider || selectableProviders[0])?.id || "";
  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId),
    [providers, selectedProviderId],
  );
  const models = useMemo(() => allowedModels(selectedProvider), [selectedProvider]);
  const projectModel =
    summary?.project.active_provider_id === selectedProvider?.id
      ? models.find((model) => model.model_id === summary?.project.active_model_id)
      : undefined;
  const defaultModel = models.find((model) => model.model_id === selectedProvider?.default_model_id);
  const fallbackModelId = (projectModel || defaultModel || models[0])?.model_id || "";
  const selectedModelId = models.some((model) => model.model_id === selectedModelIdDraft)
    ? selectedModelIdDraft
    : fallbackModelId;
  const selectedModel = models.find((model) => model.model_id === selectedModelId);
  const selectedProviderAvailable = selectableProviders.some(
    (provider) => provider.id === selectedProviderId,
  );
  const supportsTemperature = supportsParameter(selectedModel, "temperature");
  const supportsTopP = supportsParameter(selectedModel, "top_p");
  const supportsModelReasoning = supportsReasoning(selectedModel);
  const editLineLoading = !isCreate && lineQuery.isPending;
  const canAssist = Boolean(
    !readOnly && !editLineLoading && selectedProviderAvailable && selectedProvider && selectedModel,
  );
  const assistantBlockedReason = editLineLoading
    ? "Загрузка линии"
    : providersQuery.isPending
    ? "Загрузка моделей"
    : readOnly
      ? summary?.runtime.reason || "AI недоступен"
      : !selectedProvider
        ? "Выбери AI-провайдер"
        : !selectedModel
          ? "Выбери разрешенную модель"
          : selectedProvider.last_error || undefined;
  const activeProviderLabel =
    selectedProvider && selectedModel
      ? `${selectedProvider.name} · ${selectedModel.display_name} · ${
          selectedProvider.is_external ? "внешний" : "локальный"
        }`
      : "AI не выбран";
  const loadedDraft = line ? lineToDraft(line) : emptyDraft;
  const draft = isCreate ? createDraft : { ...loadedDraft, ...draftOverrides };

  function updateDraft<K extends keyof StoryLineDraft>(field: K, value: StoryLineDraft[K]) {
    if (isCreate) {
      setCreateDraft((current) => ({ ...current, [field]: value }));
      return;
    }
    setDraftOverrides((current) => ({ ...current, [field]: value }));
  }

  function invalidateLine(lineIdToInvalidate?: string) {
    void queryClient.invalidateQueries({ queryKey: storyLineQueryKeys.all });
    void queryClient.invalidateQueries({ queryKey: memoryQueryKeys.all });
    if (lineIdToInvalidate) {
      void queryClient.invalidateQueries({
        queryKey: storyLineQueryKeys.detail(projectId, lineIdToInvalidate),
      });
      void queryClient.invalidateQueries({
        queryKey: storyLineQueryKeys.progress(projectId, lineIdToInvalidate),
      });
    }
  }

  const createMutation = useMutation({
    mutationFn: (payload: StoryLineDraft) => createStoryLine(projectId, draftToPayload(payload)),
    onSuccess: (createdLine) => {
      invalidateLine(createdLine.id);
      navigate(`/projects/${encodeURIComponent(projectId)}/story-lines/${encodeURIComponent(createdLine.id)}`);
    },
  });
  const updateMutation = useMutation({
    mutationFn: (payload: StoryLineDraft) =>
      updateStoryLine(projectId, lineId || "", draftToPayload(payload)),
    onSuccess: (updatedLine) => {
      queryClient.setQueryData(storyLineQueryKeys.detail(projectId, updatedLine.id), updatedLine);
      invalidateLine(updatedLine.id);
      setDraftOverrides({});
    },
  });
  const assistantMutation = useMutation({
    mutationFn: () =>
      suggestStoryLines(projectId, {
        instructions: assistantInstructionsForMode(assistantInstructions, draft, isCreate),
        max_suggestions: 1,
        provider_id: selectedProviderId || null,
        model_id: selectedModelId || null,
        temperature: supportsTemperature ? temperature : 0.7,
        top_p: supportsTopP ? topP : null,
        reasoning_effort: supportsModelReasoning && reasoningEffort ? reasoningEffort : null,
      }),
    onSuccess: (result) => {
      const suggestion = result.story_lines[0];
      if (!suggestion) {
        setAssistantMessage("AI не вернул линию.");
        return;
      }
      if (isCreate) {
        setCreateDraft(suggestionToDraft(suggestion));
        setAssistantMessage(result.warnings[0] || "Черновик готов.");
        return;
      }
      setDraftOverrides((current) => ({
        ...suggestionToDraft(suggestion),
        status: current.status ?? draft.status,
      }));
      setAssistantMessage(result.warnings[0] || "Правки применены к черновику. Проверь и сохрани.");
    },
  });

  function submitDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || !draft.title.trim()) {
      return;
    }
    if (isCreate) {
      createMutation.mutate(draft);
      return;
    }
    updateMutation.mutate(draft);
  }

  const errors = [
    summaryQuery.error,
    providersQuery.error,
    lineQuery.error,
    progressQuery.error,
    createMutation.error,
    updateMutation.error,
    assistantMutation.error,
  ]
    .map(mutationErrorMessage)
    .filter((error): error is string => Boolean(error));
  const busy = createMutation.isPending || updateMutation.isPending || assistantMutation.isPending;
  const pageTitle = isCreate ? "Новая линия" : line?.title || draft.title || "Правка линии";
  const backUrl = `/projects/${encodeURIComponent(projectId)}/story-lines`;

  return (
    <AppShell>
      <div className="story-line-detail-route">
        <header className="story-line-detail-route__header">
          <div>
            <Link className="story-line-detail-route__back" to={backUrl}>
              <ChevronLeft size={16} aria-hidden="true" />
              Линии
            </Link>
            <h1>{pageTitle}</h1>
            <p>{summary?.project.title || "Текущий проект"}</p>
          </div>
          <StatusPill label={readOnly ? "Только чтение" : "AI доступен"} tone={readOnly ? "warning" : "ready"} />
        </header>

        {readOnly && <NoticeBlock tone="error">{summary?.runtime.reason || "AI недоступен"}</NoticeBlock>}
        {errors.map((error) => (
          <NoticeBlock key={error} tone="error">
            {error}
          </NoticeBlock>
        ))}

        <section className="story-line-detail-panel" aria-label="Ассистент линии">
          <div className="story-line-detail-panel__title">
            <Sparkles size={18} aria-hidden="true" />
            <h2>Ассистент</h2>
          </div>
          <form
            className="story-line-detail-form is-assistant"
            onSubmit={(event) => {
              event.preventDefault();
              if (canAssist) {
                assistantMutation.mutate();
              }
            }}
          >
            <section className="story-line-detail-agent-config" aria-label="Настройки модели">
              <div className="story-line-detail-agent-config__title">
                <Bot size={17} aria-hidden="true" />
                <span>Модель</span>
                <small>{activeProviderLabel}</small>
                {!canAssist && (
                  <Link
                    className="story-line-detail-agent-config__settings"
                    title="Настроить AI"
                    to="/settings/providers"
                  >
                    <PlugZap size={15} aria-hidden="true" />
                  </Link>
                )}
              </div>

              <div className="story-line-detail-two-column">
                <label className="story-line-detail-agent-field">
                  <span>Провайдер</span>
                  <select
                    disabled={readOnly || providersQuery.isPending || assistantMutation.isPending}
                    name="story-line-assistant-provider"
                    onChange={(event) => {
                      setSelectedProviderId(event.target.value);
                      setSelectedModelId("");
                    }}
                    value={selectedProviderId}
                  >
                    {selectableProviders.length === 0 && <option value="">Нет доступных</option>}
                    {selectableProviders.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="story-line-detail-agent-field">
                  <span>Модель</span>
                  <select
                    disabled={readOnly || assistantMutation.isPending || !selectedProvider}
                    name="story-line-assistant-model"
                    onChange={(event) => setSelectedModelId(event.target.value)}
                    value={selectedModelId}
                  >
                    {models.length === 0 && <option value="">Нет разрешенных</option>}
                    {models.map((model) => (
                      <option key={model.id} value={model.model_id}>
                        {model.display_name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="story-line-detail-parameter-grid">
                {supportsTemperature && (
                  <label className="story-line-detail-agent-range">
                    <span>Температура</span>
                    <input
                      disabled={readOnly || assistantMutation.isPending}
                      max="2"
                      min="0"
                      name="story-line-assistant-temperature"
                      onChange={(event) => setTemperature(Number(event.target.value))}
                      step="0.05"
                      type="range"
                      value={temperature}
                    />
                    <output>{temperature.toFixed(2)}</output>
                  </label>
                )}
                {supportsTopP && (
                  <label className="story-line-detail-agent-range">
                    <span>Top P</span>
                    <input
                      disabled={readOnly || assistantMutation.isPending}
                      max="1"
                      min="0"
                      name="story-line-assistant-top-p"
                      onChange={(event) => setTopP(Number(event.target.value))}
                      step="0.05"
                      type="range"
                      value={topP}
                    />
                    <output>{topP.toFixed(2)}</output>
                  </label>
                )}
                {supportsModelReasoning && (
                  <label className="story-line-detail-agent-field">
                    <span>Reasoning</span>
                    <select
                      disabled={readOnly || assistantMutation.isPending}
                      name="story-line-assistant-reasoning"
                      onChange={(event) =>
                        setReasoningEffort(event.target.value as StoryLineReasoningEffort | "")
                      }
                      value={reasoningEffort}
                    >
                      <option value="">Auto</option>
                      {reasoningEffortOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              {!canAssist && assistantBlockedReason && (
                <NoticeBlock tone="error">
                  {assistantBlockedReason} <Link to="/settings/providers">Настроить AI</Link>
                </NoticeBlock>
              )}
            </section>
            <textarea
              disabled={readOnly || assistantMutation.isPending}
              name="story-line-assistant-instructions"
              onChange={(event) => setAssistantInstructions(event.target.value)}
              placeholder={
                isCreate
                  ? "Например: линия доверия между героем и старшим другом"
                  : "Например: сделай конфликт яснее и обнови текущее состояние"
              }
              rows={4}
              value={assistantInstructions}
            />
            <button disabled={!canAssist || assistantMutation.isPending} type="submit">
              {assistantMutation.isPending ? (
                <LoaderCircle className="is-spinning" size={16} aria-hidden="true" />
              ) : (
                <Sparkles size={16} aria-hidden="true" />
              )}
              {isCreate ? "Собрать линию" : "Предложить правку"}
            </button>
          </form>
          {assistantMessage && <NoticeBlock>{assistantMessage}</NoticeBlock>}
        </section>

        <section className="story-line-detail-panel" aria-label={isCreate ? "Создание линии" : "Правка линии"}>
          <div className="story-line-detail-panel__title">
            <Save size={18} aria-hidden="true" />
            <h2>{isCreate ? "Черновик линии" : "Параметры линии"}</h2>
          </div>
          {!isCreate && lineQuery.isPending ? (
            <div className="story-line-detail-loading" role="status">
              <LoaderCircle className="is-spinning" size={18} aria-hidden="true" />
              <span>Загрузка линии</span>
            </div>
          ) : (
            <form className="story-line-detail-form" onSubmit={submitDraft}>
              <div className="story-line-detail-grid">
                <label className="story-line-detail-field">
                  <span>Тип</span>
                  <select
                    disabled={readOnly || busy}
                    name="story-line-type"
                    onChange={(event) => updateDraft("type", event.target.value as StoryLineType)}
                    value={draft.type}
                  >
                    {storyLineTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="story-line-detail-field">
                  <span>Статус</span>
                  <select
                    disabled={readOnly || busy}
                    name="story-line-status"
                    onChange={(event) => updateDraft("status", event.target.value as StoryLineStatus)}
                    value={draft.status}
                  >
                    {storyLineStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="story-line-detail-field">
                  <span>Приоритет</span>
                  <input
                    disabled={readOnly || busy}
                    max={10}
                    min={-10}
                    name="story-line-priority"
                    onChange={(event) => updateDraft("priority", Number(event.target.value))}
                    type="number"
                    value={draft.priority}
                  />
                </label>
              </div>

              <label className="story-line-detail-field">
                <span>Название</span>
                <input
                  disabled={readOnly || busy}
                  name="story-line-title"
                  onChange={(event) => updateDraft("title", event.target.value)}
                  value={draft.title}
                />
              </label>

              <label className="story-line-detail-field">
                <span>Описание</span>
                <textarea
                  disabled={readOnly || busy}
                  name="story-line-description"
                  onChange={(event) => updateDraft("description", event.target.value)}
                  rows={5}
                  value={draft.description}
                />
              </label>

              <label className="story-line-detail-field">
                <span>Текущее состояние</span>
                <textarea
                  disabled={readOnly || busy}
                  name="story-line-current-state"
                  onChange={(event) => updateDraft("current_state", event.target.value)}
                  rows={5}
                  value={draft.current_state}
                />
              </label>

              <div className="story-line-detail-actions">
                <button disabled={readOnly || busy || !draft.title.trim()} type="submit">
                  {createMutation.isPending || updateMutation.isPending ? (
                    <LoaderCircle className="is-spinning" size={16} aria-hidden="true" />
                  ) : (
                    <Save size={16} aria-hidden="true" />
                  )}
                  {isCreate ? "Создать" : "Сохранить"}
                </button>
                <Link to={backUrl}>К списку</Link>
              </div>
            </form>
          )}
        </section>

        <section className="story-line-detail-panel" aria-label="История линии">
          <div className="story-line-detail-panel__title">
            <h2>История линии</h2>
            {!isCreate && <span>{storyLineStatusLabel(draft.status)}</span>}
          </div>
          {isCreate ? (
            <span className="story-line-detail-empty">история появится после сохранения</span>
          ) : progressQuery.isPending ? (
            <div className="story-line-detail-loading" role="status">
              <LoaderCircle className="is-spinning" size={18} aria-hidden="true" />
              <span>Загрузка истории</span>
            </div>
          ) : progressQuery.data && progressQuery.data.progress.length > 0 ? (
            <div className="story-line-detail-history">
              {progressQuery.data.progress.map((item) => (
                <article key={item.id}>
                  <span>{item.created_at}</span>
                  <h3>{item.event_summary || "Изменение линии"}</h3>
                  {item.before_state && <p>{item.before_state}</p>}
                  {item.after_state && <strong>{item.after_state}</strong>}
                </article>
              ))}
            </div>
          ) : (
            <span className="story-line-detail-empty">записей прогресса пока нет</span>
          )}
        </section>
      </div>
    </AppShell>
  );
}
