import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, ChevronLeft, LoaderCircle, PlugZap, Plus, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { memoryQueries, memoryQueryKeys } from "../../../entities/memory";
import { allowedModels, providerQueries, type Provider, type ProviderModel } from "../../../entities/provider";
import {
  createStoryLine,
  storyLineQueries,
  storyLineQueryKeys,
  storyLineStatusLabel,
  storyLineStatusOptions,
  storyLineStatusTone,
  storyLineTypeLabel,
  storyLineTypeOptions,
  suggestStoryLines,
  updateStoryLineStatus,
  type StoryLine,
  type StoryLineFilters,
  type StoryLineReasoningEffort,
  type StoryLineStatus,
  type StoryLineSuggestion,
  type StoryLineType,
} from "../../../entities/story-line";
import { NoticeBlock, StatusPill } from "../../../shared/ui";
import { AppShell } from "../../../widgets/app-shell";
import "./StoryLinesRoute.css";

type StoryLinesRouteProps = {
  projectId: string;
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

function suggestionToDraft(suggestion: StoryLineSuggestion, status: StoryLineStatus): StoryLineDraft {
  return {
    type: suggestion.type,
    title: suggestion.title,
    description: suggestion.description || suggestion.reason || "",
    current_state: suggestion.current_state || "",
    status,
    priority: suggestion.priority,
  };
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

export function StoryLinesRoute({ projectId }: StoryLinesRouteProps) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<StoryLineFilters>({});
  const [suggestInstructions, setSuggestInstructions] = useState("");
  const [suggestions, setSuggestions] = useState<StoryLineSuggestion[]>([]);
  const [selectedProviderIdDraft, setSelectedProviderId] = useState("");
  const [selectedModelIdDraft, setSelectedModelId] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(0.9);
  const [reasoningEffort, setReasoningEffort] = useState<StoryLineReasoningEffort | "">("");

  const summaryQuery = useQuery(memoryQueries.workspaceSummary(projectId));
  const providersQuery = useQuery(providerQueries.list());
  const linesQuery = useQuery(storyLineQueries.list(projectId, filters));

  const summary = summaryQuery.data;
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
  const canSuggest = Boolean(!readOnly && selectedProviderAvailable && selectedProvider && selectedModel);
  const suggestBlockedReason = providersQuery.isPending
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
  const lines = useMemo(() => linesQuery.data || [], [linesQuery.data]);
  const groupedLines = useMemo(
    () => ({
      proposed: lines.filter((line) => line.status === "proposed"),
      active: lines.filter((line) => line.status === "active"),
      sleeping: lines.filter((line) => line.status === "sleeping"),
      completed: lines.filter((line) => line.status === "completed"),
      rejected: lines.filter((line) => line.status === "rejected"),
    }),
    [lines],
  );
  const errors = [summaryQuery.error, providersQuery.error, linesQuery.error]
    .filter((error): error is Error => error instanceof Error)
    .map((error) => error.message);

  function invalidateLines() {
    void queryClient.invalidateQueries({ queryKey: storyLineQueryKeys.all });
    void queryClient.invalidateQueries({ queryKey: memoryQueryKeys.all });
  }

  const createMutation = useMutation({
    mutationFn: (payload: StoryLineDraft) => createStoryLine(projectId, draftToPayload(payload)),
    onSuccess: () => {
      invalidateLines();
    },
  });
  const statusMutation = useMutation({
    mutationFn: ({ lineId, status }: { lineId: string; status: StoryLineStatus }) =>
      updateStoryLineStatus(projectId, lineId, status),
    onSuccess: invalidateLines,
  });
  const suggestMutation = useMutation({
    mutationFn: () =>
      suggestStoryLines(projectId, {
        instructions: suggestInstructions.trim() || null,
        max_suggestions: 5,
        provider_id: selectedProviderId || null,
        model_id: selectedModelId || null,
        temperature: supportsTemperature ? temperature : 0.7,
        top_p: supportsTopP ? topP : null,
        reasoning_effort: supportsModelReasoning && reasoningEffort ? reasoningEffort : null,
      }),
    onSuccess: (result) => setSuggestions(result.story_lines),
  });

  function createFromSuggestion(suggestion: StoryLineSuggestion, status: StoryLineStatus) {
    if (readOnly) {
      return;
    }
    createMutation.mutate(suggestionToDraft(suggestion, status));
  }

  return (
    <AppShell>
      <div className="story-lines-route">
        <header className="story-lines-route__header">
          <div>
            <Link className="story-lines-route__back" to={`/projects/${projectId}`}>
              <ChevronLeft size={16} aria-hidden="true" />
              Проект
            </Link>
            <h1>Линии истории</h1>
            <p>{summary?.project.title || "Текущий проект"}</p>
          </div>
          <div className="story-lines-route__status">
            <StatusPill label={readOnly ? "Только чтение" : "AI доступен"} tone={readOnly ? "warning" : "ready"} />
            {!readOnly && (
              <Link to={`/projects/${encodeURIComponent(projectId)}/story-lines/new`}>
                <Plus size={16} aria-hidden="true" />
                Новая линия
              </Link>
            )}
            <Link to={`/projects/${projectId}/chapters/prepare`}>Подготовить главу</Link>
          </div>
        </header>

        {errors.map((error) => (
          <NoticeBlock key={error} tone="error">
            {error}
          </NoticeBlock>
        ))}
        {summary?.warnings.map((warning) => <NoticeBlock key={warning}>{warning}</NoticeBlock>)}

        <section className="story-lines-toolbar" aria-label="Фильтры линий">
          <input
            aria-label="Поиск по линиям"
            onChange={(event) => setFilters({ ...filters, search: event.target.value })}
            placeholder="Поиск"
            type="search"
            value={filters.search || ""}
          />
          <select
            aria-label="Тип линии"
            onChange={(event) => setFilters({ ...filters, type: event.target.value as StoryLineType | "" })}
            value={filters.type || ""}
          >
            <option value="">Все типы</option>
            {storyLineTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Статус линии"
            onChange={(event) => setFilters({ ...filters, status: event.target.value as StoryLineStatus | "" })}
            value={filters.status || ""}
          >
            <option value="">Все статусы</option>
            {storyLineStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </section>

        <div className="story-lines-route__layout">
          <main className="story-lines-route__main">
            <LineGroup
              lines={groupedLines.active}
              onStatus={(line, status) => statusMutation.mutate({ lineId: line.id, status })}
              projectId={projectId}
              readOnly={readOnly}
              title="Активные"
              updating={statusMutation.isPending}
            />
            <LineGroup
              lines={groupedLines.proposed}
              onStatus={(line, status) => statusMutation.mutate({ lineId: line.id, status })}
              projectId={projectId}
              readOnly={readOnly}
              title="Требуют решения"
              updating={statusMutation.isPending}
            />
            <LineGroup
              lines={groupedLines.sleeping}
              onStatus={(line, status) => statusMutation.mutate({ lineId: line.id, status })}
              projectId={projectId}
              readOnly={readOnly}
              title="Спящие"
              updating={statusMutation.isPending}
            />
            <LineGroup
              lines={[...groupedLines.completed, ...groupedLines.rejected]}
              onStatus={(line, status) => statusMutation.mutate({ lineId: line.id, status })}
              projectId={projectId}
              readOnly={readOnly}
              title="Закрытые"
              updating={statusMutation.isPending}
            />
          </main>

          <aside className="story-lines-route__side">
            <section className="story-lines-panel" aria-label="AI-предложения линий">
              <div className="story-lines-panel__title">
                <Sparkles size={18} aria-hidden="true" />
                <h2>Предложить линии</h2>
              </div>
              <form
                className="story-lines-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (canSuggest) {
                    suggestMutation.mutate();
                  }
                }}
              >
                <section className="story-lines-agent-config" aria-label="Настройки модели">
                  <div className="story-lines-agent-config__title">
                    <Bot size={17} aria-hidden="true" />
                    <span>Модель</span>
                    <small>{activeProviderLabel}</small>
                    {!canSuggest && (
                      <Link
                        className="story-lines-agent-config__settings"
                        title="Настроить AI"
                        to="/settings/providers"
                      >
                        <PlugZap size={15} aria-hidden="true" />
                      </Link>
                    )}
                  </div>

                  <div className="story-lines-two-column">
                    <label className="story-lines-agent-field">
                      <span>Провайдер</span>
                      <select
                        disabled={readOnly || providersQuery.isPending || suggestMutation.isPending}
                        name="story-lines-provider"
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
                    <label className="story-lines-agent-field">
                      <span>Модель</span>
                      <select
                        disabled={readOnly || suggestMutation.isPending || !selectedProvider}
                        name="story-lines-model"
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

                  <div className="story-lines-parameter-grid">
                    {supportsTemperature && (
                      <label className="story-lines-agent-range">
                        <span>Температура</span>
                        <input
                          disabled={readOnly || suggestMutation.isPending}
                          max="2"
                          min="0"
                          name="story-lines-temperature"
                          onChange={(event) => setTemperature(Number(event.target.value))}
                          step="0.05"
                          type="range"
                          value={temperature}
                        />
                        <output>{temperature.toFixed(2)}</output>
                      </label>
                    )}
                    {supportsTopP && (
                      <label className="story-lines-agent-range">
                        <span>Top P</span>
                        <input
                          disabled={readOnly || suggestMutation.isPending}
                          max="1"
                          min="0"
                          name="story-lines-top-p"
                          onChange={(event) => setTopP(Number(event.target.value))}
                          step="0.05"
                          type="range"
                          value={topP}
                        />
                        <output>{topP.toFixed(2)}</output>
                      </label>
                    )}
                    {supportsModelReasoning && (
                      <label className="story-lines-agent-field">
                        <span>Reasoning</span>
                        <select
                          disabled={readOnly || suggestMutation.isPending}
                          name="story-lines-reasoning"
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

                  {!canSuggest && suggestBlockedReason && (
                    <NoticeBlock tone="error">
                      {suggestBlockedReason} <Link to="/settings/providers">Настроить AI</Link>
                    </NoticeBlock>
                  )}
                </section>
                <textarea
                  disabled={readOnly}
                  onChange={(event) => setSuggestInstructions(event.target.value)}
                  placeholder="Например: дай одну угрозу и одну линию отношений"
                  rows={4}
                  value={suggestInstructions}
                />
                <button disabled={!canSuggest || suggestMutation.isPending} type="submit">
                  {suggestMutation.isPending ? (
                    <LoaderCircle className="is-spinning" size={15} aria-hidden="true" />
                  ) : (
                    <Sparkles size={15} aria-hidden="true" />
                  )}
                  Спросить AI
                </button>
              </form>
              {suggestMutation.error instanceof Error && (
                <NoticeBlock tone="error">{suggestMutation.error.message}</NoticeBlock>
              )}
              <div className="story-line-suggestions">
                {suggestions.map((suggestion) => (
                  <article key={`${suggestion.type}-${suggestion.title}`}>
                    <strong>{suggestion.title}</strong>
                    <span>{storyLineTypeLabel(suggestion.type)}</span>
                    {(suggestion.description || suggestion.reason) && (
                      <p>{suggestion.description || suggestion.reason}</p>
                    )}
                    <div>
                      <button
                        disabled={readOnly || createMutation.isPending}
                        onClick={() => createFromSuggestion(suggestion, "proposed")}
                        type="button"
                      >
                        Сохранить предложением
                      </button>
                      <button
                        disabled={readOnly || createMutation.isPending}
                        onClick={() => createFromSuggestion(suggestion, "active")}
                        type="button"
                      >
                        Сохранить активной
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function LineGroup({
  lines,
  onStatus,
  projectId,
  readOnly,
  title,
  updating,
}: {
  lines: StoryLine[];
  onStatus: (line: StoryLine, status: StoryLineStatus) => void;
  projectId: string;
  readOnly: boolean;
  title: string;
  updating: boolean;
}) {
  return (
    <section className="story-lines-group" aria-label={title}>
      <div className="story-lines-group__heading">
        <h2>{title}</h2>
        <span>{lines.length}</span>
      </div>
      <div className="story-lines-list">
        {lines.map((line) => (
          <article className="story-line-card" key={line.id}>
            <div className="story-line-card__header">
              <div>
                <span>{storyLineTypeLabel(line.type)}</span>
                <h3>{line.title}</h3>
              </div>
              <StatusPill label={storyLineStatusLabel(line.status)} tone={storyLineStatusTone(line.status)} />
            </div>
            {line.description && <p>{line.description}</p>}
            {line.current_state && <p className="story-line-card__state">{line.current_state}</p>}
            <div className="story-line-card__actions">
              <Link to={`/projects/${encodeURIComponent(projectId)}/story-lines/${encodeURIComponent(line.id)}`}>
                Правка
              </Link>
              <button disabled={readOnly || updating} onClick={() => onStatus(line, "active")} type="button">
                <Check size={15} aria-hidden="true" />
                Активна
              </button>
              <button disabled={readOnly || updating} onClick={() => onStatus(line, "sleeping")} type="button">
                Спит
              </button>
              <button disabled={readOnly || updating} onClick={() => onStatus(line, "completed")} type="button">
                Закрыть
              </button>
              <button disabled={readOnly || updating} onClick={() => onStatus(line, "rejected")} type="button">
                <X size={15} aria-hidden="true" />
                Отклонить
              </button>
            </div>
          </article>
        ))}
        {lines.length === 0 && <NoticeBlock>В этой группе пока пусто</NoticeBlock>}
      </div>
    </section>
  );
}
