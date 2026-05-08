import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Bot,
  Check,
  ChevronLeft,
  LoaderCircle,
  PlugZap,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  projectMutations,
  type StartStoryAnalysis,
  type StartStoryExpansionPolicy,
  type StartStoryLineCandidate,
  type StartStoryLineStatus,
  type StartStoryLineType,
  type StartStoryMemoryCandidate,
  type StartStoryMemoryStatus,
  type StartStoryMemoryType,
  type StartStoryPointCandidate,
  type StartStoryReasoningEffort,
} from "../../../entities/project";
import {
  allowedModels,
  modelSupportsParameter,
  modelSupportsReasoning,
  providerQueries,
  selectableAiProviders,
} from "../../../entities/provider";
import { runtimeQueries } from "../../../entities/runtime";
import { NoticeBlock } from "../../../shared/ui";
import { AppShell } from "../../../widgets/app-shell";
import "./ProjectCreateRoute.css";

type Option<T extends string> = {
  value: T;
  label: string;
  description?: string;
};

const roleOptions: Option<string>[] = [
  { value: "", label: "Пока не знаю" },
  { value: "hero", label: "Быть героем" },
  { value: "control_hero", label: "Управлять героем" },
  { value: "control_cast", label: "Управлять несколькими" },
  { value: "author", label: "Быть автором" },
];

const memoryTypeOptions: Option<StartStoryMemoryType>[] = [
  { value: "character", label: "Персонаж" },
  { value: "location", label: "Место" },
  { value: "item", label: "Предмет" },
  { value: "group", label: "Группа" },
  { value: "world_rule", label: "Правило мира" },
  { value: "mystery", label: "Тайна" },
  { value: "event", label: "Событие" },
  { value: "canon_fact", label: "Факт" },
  { value: "note", label: "Заметка" },
];

const memoryStatusOptions: Option<StartStoryMemoryStatus>[] = [
  { value: "proposed", label: "Предложение" },
  { value: "draft", label: "Черновик" },
  { value: "canon", label: "Канон" },
  { value: "rejected", label: "Отклонить" },
  { value: "outdated", label: "Устарело" },
];

const lineTypeOptions: Option<StartStoryLineType>[] = [
  { value: "character", label: "Герой" },
  { value: "mystery", label: "Тайна" },
  { value: "relationship", label: "Отношения" },
  { value: "threat", label: "Угроза" },
  { value: "theme", label: "Тема" },
  { value: "custom", label: "Другое" },
];

const lineStatusOptions: Option<StartStoryLineStatus>[] = [
  { value: "proposed", label: "Предложена" },
  { value: "active", label: "Активна" },
  { value: "sleeping", label: "Спит" },
  { value: "completed", label: "Завершена" },
  { value: "rejected", label: "Отклонить" },
];

const expansionPolicies: Option<StartStoryExpansionPolicy>[] = [
  {
    value: "ask",
    label: "С подтверждением важного",
    description: "AI спросит перед крупными фактами, поворотами и каноном.",
  },
  {
    value: "draft",
    label: "Свободно в черновике",
    description: "AI может предлагать детали в черновиках, а ты утвердишь их позже.",
  },
  {
    value: "request",
    label: "Только по запросу",
    description: "AI не расширяет мир сам, пока ты явно не попросишь.",
  },
  {
    value: "mixed",
    label: "Смешанный режим",
    description: "Мелкие детали можно предлагать сразу, важное остается на подтверждении.",
  },
];

const reasoningEffortOptions: Option<StartStoryReasoningEffort>[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const agentProgressSteps = [
  "Подключаюсь к модели",
  "Разбираю синопсис",
  "Достаю стартовую память",
  "Собираю мягкие линии",
  "Ищу стартовые точки",
];

function mutationErrorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

function splitTitles(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinTitles(value: string[]): string {
  return value.join(", ");
}

export function ProjectCreateRoute() {
  const navigate = useNavigate();
  const runtimeQuery = useQuery(runtimeQueries.status());
  const providersQuery = useQuery(providerQueries.list());
  const analyzeMutation = useMutation(projectMutations.analyzeStartStory());
  const refineMutation = useMutation(projectMutations.refineStartStory());
  const confirmMutation = useMutation(projectMutations.confirmStartStory());

  const [title, setTitle] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [tone, setTone] = useState("");
  const [avoid, setAvoid] = useState("");
  const [preferredUserRole, setPreferredUserRole] = useState("");
  const [analysis, setAnalysis] = useState<StartStoryAnalysis | null>(null);
  const [projectTitle, setProjectTitle] = useState("");
  const [understoodSynopsis, setUnderstoodSynopsis] = useState("");
  const [memoryItems, setMemoryItems] = useState<StartStoryMemoryCandidate[]>([]);
  const [storyLines, setStoryLines] = useState<StartStoryLineCandidate[]>([]);
  const [startPoints, setStartPoints] = useState<StartStoryPointCandidate[]>([]);
  const [selectedStartPointIndex, setSelectedStartPointIndex] = useState(0);
  const [skipStartPoint, setSkipStartPoint] = useState(false);
  const [expansionPolicy, setExpansionPolicy] = useState<StartStoryExpansionPolicy>("ask");
  const [selectedProviderIdDraft, setSelectedProviderId] = useState("");
  const [selectedModelIdDraft, setSelectedModelId] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(0.9);
  const [reasoningEffort, setReasoningEffort] = useState<StartStoryReasoningEffort | "">("");
  const [refineFeedback, setRefineFeedback] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const providers = useMemo(() => providersQuery.data || [], [providersQuery.data]);
  const selectableProviders = useMemo(
    () => selectableAiProviders(providers),
    [providers],
  );
  const runtimeProviderId = runtimeQuery.data?.active_provider?.id;
  const runtimeProvider = selectableProviders.find((provider) => provider.id === runtimeProviderId);
  const defaultProvider = selectableProviders.find((provider) => provider.is_default);
  const selectedProviderId =
    selectedProviderIdDraft || (runtimeProvider || defaultProvider || selectableProviders[0])?.id || "";
  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId),
    [providers, selectedProviderId],
  );
  const models = useMemo(() => allowedModels(selectedProvider), [selectedProvider]);
  const runtimeModelId =
    runtimeQuery.data?.active_provider?.id === selectedProvider?.id
      ? runtimeQuery.data?.active_model?.model_id
      : undefined;
  const runtimeModel = models.find((model) => model.model_id === runtimeModelId);
  const defaultModel = models.find((model) => model.model_id === selectedProvider?.default_model_id);
  const fallbackModelId = (runtimeModel || defaultModel || models[0])?.model_id || "";
  const selectedModelId = models.some((model) => model.model_id === selectedModelIdDraft)
    ? selectedModelIdDraft
    : fallbackModelId;
  const selectedModel = models.find((model) => model.model_id === selectedModelId);
  const selectedProviderAvailable = selectableProviders.some(
    (provider) => provider.id === selectedProviderId,
  );
  const supportsTemperature = modelSupportsParameter(selectedModel, "temperature");
  const supportsTopP = modelSupportsParameter(selectedModel, "top_p");
  const supportsModelReasoning = modelSupportsReasoning(selectedModel);
  const canAnalyze = Boolean(selectedProviderAvailable && selectedProvider && selectedModel);
  const blockedReason =
    providersQuery.isPending
      ? "Загрузка моделей"
      : !selectedProvider
        ? runtimeQuery.data?.reason || "Выбери AI-провайдер"
        : !selectedModel
          ? "Выбери разрешенную модель"
          : selectedProvider.last_error || undefined;
  const busy = analyzeMutation.isPending || refineMutation.isPending || confirmMutation.isPending;
  const activeProviderLabel = useMemo(() => {
    if (!analysis) {
      if (!selectedProvider || !selectedModel) {
        return "AI не выбран";
      }
      return `${selectedProvider.name} · ${selectedModel.display_name}`;
    }
    return analysis.provider_is_external
      ? `${analysis.provider_name} · внешний`
      : `${analysis.provider_name} · локальный`;
  }, [analysis, selectedModel, selectedProvider]);

  function applyAnalysisResult(
    result: StartStoryAnalysis,
    titlePriority: "input" | "suggested" = "input",
  ) {
    setAnalysis(result);
    setProjectTitle(
      titlePriority === "suggested"
        ? result.suggested_title || result.title || projectTitle
        : result.title || result.suggested_title || "",
    );
    setUnderstoodSynopsis(result.understood_synopsis);
    setMemoryItems(result.memory_items);
    setStoryLines(result.story_lines);
    setStartPoints(result.start_points);
    setSelectedStartPointIndex(0);
    setSkipStartPoint(result.start_points.length === 0);
  }

  function handleAnalyze() {
    setFormError(null);
    if (!synopsis.trim()) {
      setFormError("Нужна хотя бы одна фраза идеи.");
      return;
    }
    if (!canAnalyze) {
      setFormError(blockedReason || "AI недоступен.");
      return;
    }

    analyzeMutation.mutate(
      {
        synopsis,
        title: title || null,
        tone: tone || null,
        avoid: avoid || null,
        preferred_user_role: preferredUserRole || null,
        provider_id: selectedProviderId,
        model_id: selectedModelId,
        temperature: supportsTemperature ? temperature : 0.7,
        top_p: supportsTopP ? topP : null,
        reasoning_effort: supportsModelReasoning && reasoningEffort ? reasoningEffort : null,
      },
      {
        onSuccess: (result) => {
          applyAnalysisResult(result);
          setRefineFeedback("");
        },
      },
    );
  }

  function handleRefine() {
    if (!analysis) {
      return;
    }
    const feedback = refineFeedback.trim();
    setFormError(null);
    if (!feedback) {
      setFormError("Напиши ответ или правку для AI.");
      return;
    }

    refineMutation.mutate(
      {
        source_synopsis: analysis.source_synopsis,
        title: analysis.title,
        tone: analysis.tone,
        avoid: analysis.avoid,
        preferred_user_role: analysis.preferred_user_role,
        provider_id: selectedProviderId || analysis.provider_id,
        model_id: selectedModelId || analysis.model_id,
        temperature: supportsTemperature ? temperature : 0.7,
        top_p: supportsTopP ? topP : null,
        reasoning_effort: supportsModelReasoning && reasoningEffort ? reasoningEffort : null,
        feedback,
        current_project_title: projectTitle,
        current_understood_synopsis: understoodSynopsis,
        current_emotional_core: analysis.emotional_core,
        current_questions: analysis.questions,
        current_memory_items: memoryItems,
        current_story_lines: storyLines,
        current_start_points: startPoints,
      },
      {
        onSuccess: (result) => {
          applyAnalysisResult(result, "suggested");
          setRefineFeedback("");
        },
      },
    );
  }

  function handleConfirm() {
    if (!analysis) {
      return;
    }
    setFormError(null);
    const selectedStartPoint = skipStartPoint ? null : startPoints[selectedStartPointIndex];
    if (!projectTitle.trim()) {
      setFormError("Название проекта нужно перед созданием.");
      return;
    }
    if (!skipStartPoint && !selectedStartPoint) {
      setFormError("Выбери стартовую точку или явно пропусти ее.");
      return;
    }
    if (
      selectedStartPoint &&
      (!selectedStartPoint.title.trim() || !selectedStartPoint.situation.trim())
    ) {
      setFormError("У стартовой точки нужны название и ситуация.");
      return;
    }

    confirmMutation.mutate(
      {
        source_synopsis: analysis.source_synopsis,
        project_title: projectTitle,
        understood_synopsis: understoodSynopsis || analysis.understood_synopsis,
        provider_id: analysis.provider_id,
        model_id: analysis.model_id,
        expansion_policy: expansionPolicy,
        memory_items: memoryItems,
        story_lines: storyLines,
        selected_start_point: selectedStartPoint,
        skip_start_point: skipStartPoint,
      },
      {
        onSuccess: (result) => {
          navigate(`/projects/${encodeURIComponent(result.project.id)}`);
        },
      },
    );
  }

  function updateMemoryItem<K extends keyof StartStoryMemoryCandidate>(
    index: number,
    field: K,
    value: StartStoryMemoryCandidate[K],
  ) {
    setMemoryItems((items) =>
      items.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    );
  }

  function updateStoryLine<K extends keyof StartStoryLineCandidate>(
    index: number,
    field: K,
    value: StartStoryLineCandidate[K],
  ) {
    setStoryLines((items) =>
      items.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    );
  }

  function updateStartPoint<K extends keyof StartStoryPointCandidate>(
    index: number,
    field: K,
    value: StartStoryPointCandidate[K],
  ) {
    setStartPoints((items) =>
      items.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    );
  }

  function addMemoryItem() {
    setMemoryItems((items) => [
      ...items,
      {
        type: "note",
        title: "Новый элемент",
        summary: "",
        body: null,
        status: "draft",
        importance: 0,
        reason: null,
      },
    ]);
  }

  function addStoryLine() {
    setStoryLines((items) => [
      ...items,
      {
        type: "custom",
        title: "Новая линия",
        description: "",
        current_state: "",
        status: "active",
        priority: 0,
        reason: null,
      },
    ]);
  }

  function addStartPoint() {
    setStartPoints((items) => {
      const next = [
        ...items,
        {
          title: "Своя стартовая точка",
          situation: "",
          present_character_titles: [],
          tension: "",
          user_role_hint: "",
        },
      ];
      setSelectedStartPointIndex(next.length - 1);
      setSkipStartPoint(false);
      return next;
    });
  }

  const analysisError = mutationErrorMessage(analyzeMutation.error);
  const refineError = mutationErrorMessage(refineMutation.error);
  const confirmError = mutationErrorMessage(confirmMutation.error);
  const selectedExpansionPolicy = expansionPolicies.find((option) => option.value === expansionPolicy);

  return (
    <AppShell>
      <div className="project-create-route">
        <header className="project-create-route__header">
          <div>
            <p className="project-create-route__eyebrow">Старт истории</p>
            <h1>Начать историю</h1>
          </div>
          <Link className="project-create-route__back-link" to="/projects">
            <ChevronLeft size={16} aria-hidden="true" />
            Проекты
          </Link>
        </header>

        {!canAnalyze && blockedReason && (
          <NoticeBlock tone="error">
            {blockedReason}{" "}
            <Link to="/settings/providers">Настроить AI</Link>
          </NoticeBlock>
        )}

        {(formError || analysisError || refineError || confirmError) && (
          <NoticeBlock tone="error">{formError || analysisError || refineError || confirmError}</NoticeBlock>
        )}

        <section className="start-story-grid">
          <form
            className="start-story-panel"
            onSubmit={(event) => {
              event.preventDefault();
              handleAnalyze();
            }}
          >
            <div className="start-story-panel__header">
              <div>
                <h2>Идея</h2>
                <p>{activeProviderLabel}</p>
              </div>
              {!canAnalyze && (
                <Link className="start-story-panel__settings" to="/settings/providers">
                  <PlugZap size={16} aria-hidden="true" />
                </Link>
              )}
            </div>

            <section className="start-story-model-config" aria-label="Настройки модели">
              <div className="start-story-model-config__title">
                <Bot size={17} aria-hidden="true" />
                <span>Модель</span>
              </div>
              <div className="start-story-two-column">
                <label className="start-story-field">
                  <span>Провайдер</span>
                  <select
                    disabled={busy || providersQuery.isPending}
                    name="start-story-provider"
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
                <label className="start-story-field">
                  <span>Модель</span>
                  <select
                    disabled={busy || !selectedProvider}
                    name="start-story-model"
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

              <div className="start-story-parameter-grid">
                {supportsTemperature && (
                  <label className="start-story-range">
                    <span>Температура</span>
                    <input
                      disabled={busy}
                      max="2"
                      min="0"
                      name="start-story-temperature"
                      onChange={(event) => setTemperature(Number(event.target.value))}
                      step="0.05"
                      type="range"
                      value={temperature}
                    />
                    <output>{temperature.toFixed(2)}</output>
                  </label>
                )}
                {supportsTopP && (
                  <label className="start-story-range">
                    <span>Top P</span>
                    <input
                      disabled={busy}
                      max="1"
                      min="0"
                      name="start-story-top-p"
                      onChange={(event) => setTopP(Number(event.target.value))}
                      step="0.05"
                      type="range"
                      value={topP}
                    />
                    <output>{topP.toFixed(2)}</output>
                  </label>
                )}
                {supportsModelReasoning && (
                  <label className="start-story-field">
                    <span>Reasoning</span>
                    <select
                      disabled={busy}
                      name="start-story-reasoning"
                      onChange={(event) =>
                        setReasoningEffort(event.target.value as StartStoryReasoningEffort | "")
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
            </section>

            <label className="start-story-field">
              <span>Рабочее название</span>
              <input
                disabled={busy}
                name="working-title"
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Можно оставить пустым"
                value={title}
              />
            </label>

            <label className="start-story-field">
              <span>Идея истории</span>
              <textarea
                disabled={busy}
                name="synopsis"
                onChange={(event) => setSynopsis(event.target.value)}
                placeholder="Одна сцена, конфликт, герой или странный образ"
                rows={9}
                value={synopsis}
              />
            </label>

            <div className="start-story-two-column">
              <label className="start-story-field">
                <span>Тон</span>
                <input
                  disabled={busy}
                  name="tone"
                  onChange={(event) => setTone(event.target.value)}
                  placeholder="мрачное, теплое, тревожное"
                  value={tone}
                />
              </label>
              <label className="start-story-field">
                <span>Роль</span>
                <select
                  disabled={busy}
                  name="preferred-user-role"
                  onChange={(event) => setPreferredUserRole(event.target.value)}
                  value={preferredUserRole}
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="start-story-field">
              <span>Чего избегать</span>
              <textarea
                disabled={busy}
                name="avoid"
                onChange={(event) => setAvoid(event.target.value)}
                placeholder="Темы, жанровые решения или повороты"
                rows={3}
                value={avoid}
              />
            </label>

            <button className="start-story-primary" disabled={!canAnalyze || busy} type="submit">
              {analyzeMutation.isPending ? (
                <LoaderCircle className="is-spinning" size={17} aria-hidden="true" />
              ) : (
                <Sparkles size={17} aria-hidden="true" />
              )}
              {analyzeMutation.isPending ? "AI разбирает" : "Разобрать идею"}
            </button>
          </form>

          <section className="start-story-panel" aria-live="polite">
            <div className="start-story-panel__header">
              <div>
                <h2>Анализ</h2>
                <p>{refineMutation.isPending ? "AI вносит правки" : analysis ? "Готов к правкам" : "Ждет идеи"}</p>
              </div>
            </div>

            {analyzeMutation.isPending ? (
              <div className="start-story-agent-progress" role="status">
                <div className="start-story-agent-progress__orb">
                  <LoaderCircle className="is-spinning" size={22} aria-hidden="true" />
                </div>
                <div>
                  <strong>AI разбирает историю</strong>
                  <p>{selectedModel?.display_name || "Модель"} может отвечать от нескольких секунд до пары минут.</p>
                </div>
                <ol>
                  {agentProgressSteps.map((step, index) => (
                    <li key={step} style={{ "--step-index": index } as CSSProperties}>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            ) : !analysis ? (
              <div className="start-story-empty">
                <p>Не нужно знать финал. Достаточно сцены, героя, мира или конфликта.</p>
              </div>
            ) : (
              <div className="start-story-analysis">
                <label className="start-story-field">
                  <span>Название проекта</span>
                  <input
                    disabled={busy}
                    name="project-title"
                    onChange={(event) => setProjectTitle(event.target.value)}
                    value={projectTitle}
                  />
                </label>

                <label className="start-story-field">
                  <span>Как AI понял историю</span>
                  <textarea
                    disabled={busy}
                    name="understood-synopsis"
                    onChange={(event) => setUnderstoodSynopsis(event.target.value)}
                    rows={5}
                    value={understoodSynopsis}
                  />
                </label>

                {analysis.emotional_core && (
                  <div className="start-story-note">
                    <strong>Ядро:</strong> {analysis.emotional_core}
                  </div>
                )}

                {analysis.questions.length > 0 && (
                  <div className="start-story-questions">
                    {analysis.questions.slice(0, 3).map((question) => (
                      <p key={question.question}>{question.question}</p>
                    ))}
                  </div>
                )}

                <form
                  className="start-story-refine"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleRefine();
                  }}
                >
                  <div className="start-story-refine__title">
                    <Sparkles size={16} aria-hidden="true" />
                    <span>AI-правка</span>
                  </div>
                  <label className="start-story-field">
                    <span>Ответ / правка</span>
                    <textarea
                      disabled={busy}
                      name="start-story-refine-feedback"
                      onChange={(event) => setRefineFeedback(event.target.value)}
                      rows={4}
                      value={refineFeedback}
                    />
                  </label>

                  {refineMutation.isPending && (
                    <div className="start-story-refine-progress" role="status">
                      <LoaderCircle className="is-spinning" size={18} aria-hidden="true" />
                      <span>AI пересобирает анализ</span>
                    </div>
                  )}

                  <div className="start-story-refine__actions">
                    <button
                      className="start-story-secondary"
                      disabled={busy || !refineFeedback.trim()}
                      type="submit"
                    >
                      {refineMutation.isPending ? (
                        <LoaderCircle className="is-spinning" size={16} aria-hidden="true" />
                      ) : (
                        <Sparkles size={16} aria-hidden="true" />
                      )}
                      {refineMutation.isPending ? "AI правит" : "Переделать анализ"}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </section>
        </section>

        {analysis && (
          <>
            <section className="start-story-section">
              <div className="start-story-section__header">
                <div>
                  <h2>Стартовая память</h2>
                  <p>{memoryItems.filter((item) => item.status !== "rejected").length}</p>
                </div>
                <button className="start-story-secondary" disabled={busy} onClick={addMemoryItem} type="button">
                  <Plus size={16} aria-hidden="true" />
                  Элемент
                </button>
              </div>
              <div className="start-story-card-grid">
                {memoryItems.map((item, index) => (
                  <article className="start-story-card" key={`${item.title}-${index}`}>
                    <div className="start-story-card__row">
                      <select
                        disabled={busy}
                        name={`memory-${index}-type`}
                        onChange={(event) =>
                          updateMemoryItem(index, "type", event.target.value as StartStoryMemoryType)
                        }
                        value={item.type}
                      >
                        {memoryTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <select
                        disabled={busy}
                        name={`memory-${index}-status`}
                        onChange={(event) =>
                          updateMemoryItem(
                            index,
                            "status",
                            event.target.value as StartStoryMemoryStatus,
                          )
                        }
                        value={item.status}
                      >
                        {memoryStatusOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <label className="start-story-field is-compact">
                      <span>Название</span>
                      <input
                        disabled={busy}
                        name={`memory-${index}-title`}
                        onChange={(event) => updateMemoryItem(index, "title", event.target.value)}
                        value={item.title}
                      />
                    </label>
                    <label className="start-story-field is-compact">
                      <span>Описание</span>
                      <textarea
                        disabled={busy}
                        name={`memory-${index}-summary`}
                        onChange={(event) => updateMemoryItem(index, "summary", event.target.value)}
                        rows={3}
                        value={item.summary || ""}
                      />
                    </label>
                    <button
                      className="start-story-icon-button"
                      disabled={busy}
                      onClick={() =>
                        setMemoryItems((items) => items.filter((_, itemIndex) => itemIndex !== index))
                      }
                      title="Удалить элемент"
                      type="button"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </article>
                ))}
              </div>
            </section>

            <section className="start-story-section">
              <div className="start-story-section__header">
                <div>
                  <h2>Линии истории</h2>
                  <p>{storyLines.filter((line) => line.status !== "rejected").length}</p>
                </div>
                <button className="start-story-secondary" disabled={busy} onClick={addStoryLine} type="button">
                  <Plus size={16} aria-hidden="true" />
                  Линия
                </button>
              </div>
              <div className="start-story-card-grid">
                {storyLines.map((line, index) => (
                  <article className="start-story-card" key={`${line.title}-${index}`}>
                    <div className="start-story-card__row">
                      <select
                        disabled={busy}
                        name={`story-line-${index}-type`}
                        onChange={(event) =>
                          updateStoryLine(index, "type", event.target.value as StartStoryLineType)
                        }
                        value={line.type}
                      >
                        {lineTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <select
                        disabled={busy}
                        name={`story-line-${index}-status`}
                        onChange={(event) =>
                          updateStoryLine(index, "status", event.target.value as StartStoryLineStatus)
                        }
                        value={line.status}
                      >
                        {lineStatusOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <label className="start-story-field is-compact">
                      <span>Название</span>
                      <input
                        disabled={busy}
                        name={`story-line-${index}-title`}
                        onChange={(event) => updateStoryLine(index, "title", event.target.value)}
                        value={line.title}
                      />
                    </label>
                    <label className="start-story-field is-compact">
                      <span>Состояние</span>
                      <textarea
                        disabled={busy}
                        name={`story-line-${index}-state`}
                        onChange={(event) =>
                          updateStoryLine(index, "current_state", event.target.value)
                        }
                        rows={3}
                        value={line.current_state || ""}
                      />
                    </label>
                    <button
                      className="start-story-icon-button"
                      disabled={busy}
                      onClick={() =>
                        setStoryLines((items) => items.filter((_, itemIndex) => itemIndex !== index))
                      }
                      title="Удалить линию"
                      type="button"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </article>
                ))}
              </div>
            </section>

            <section className="start-story-section">
              <div className="start-story-section__header">
                <div>
                  <h2>Правила и старт</h2>
                  <p>{selectedExpansionPolicy?.description}</p>
                </div>
                <button className="start-story-secondary" disabled={busy} onClick={addStartPoint} type="button">
                  <Plus size={16} aria-hidden="true" />
                  Точка
                </button>
              </div>

              <div className="start-story-policy">
                {expansionPolicies.map((policy) => (
                  <button
                    aria-label={`${policy.label}. ${policy.description}`}
                    aria-pressed={policy.value === expansionPolicy}
                    className={policy.value === expansionPolicy ? "is-selected" : ""}
                    disabled={busy}
                    key={policy.value}
                    onClick={() => setExpansionPolicy(policy.value)}
                    title={policy.description}
                    type="button"
                  >
                    <span>{policy.label}</span>
                    <small>{policy.description}</small>
                  </button>
                ))}
              </div>

              <div className="start-story-card-grid">
                {startPoints.map((point, index) => (
                  <article
                    className={`start-story-card is-start-point${
                      !skipStartPoint && selectedStartPointIndex === index ? " is-selected" : ""
                    }`}
                    key={`${point.title}-${index}`}
                  >
                    <label className="start-story-choice">
                      <input
                        checked={!skipStartPoint && selectedStartPointIndex === index}
                        disabled={busy}
                        name="start-point"
                        onChange={() => {
                          setSelectedStartPointIndex(index);
                          setSkipStartPoint(false);
                        }}
                        type="radio"
                      />
                      <span>Выбрать</span>
                    </label>
                    <label className="start-story-field is-compact">
                      <span>Название</span>
                      <input
                        disabled={busy}
                        name={`start-point-${index}-title`}
                        onChange={(event) => updateStartPoint(index, "title", event.target.value)}
                        value={point.title}
                      />
                    </label>
                    <label className="start-story-field is-compact">
                      <span>Ситуация</span>
                      <textarea
                        disabled={busy}
                        name={`start-point-${index}-situation`}
                        onChange={(event) => updateStartPoint(index, "situation", event.target.value)}
                        rows={3}
                        value={point.situation}
                      />
                    </label>
                    <label className="start-story-field is-compact">
                      <span>Участники</span>
                      <input
                        disabled={busy}
                        name={`start-point-${index}-participants`}
                        onChange={(event) =>
                          updateStartPoint(
                            index,
                            "present_character_titles",
                            splitTitles(event.target.value),
                          )
                        }
                        value={joinTitles(point.present_character_titles)}
                      />
                    </label>
                    <label className="start-story-field is-compact">
                      <span>Напряжение</span>
                      <input
                        disabled={busy}
                        name={`start-point-${index}-tension`}
                        onChange={(event) => updateStartPoint(index, "tension", event.target.value)}
                        value={point.tension || ""}
                      />
                    </label>
                  </article>
                ))}
              </div>

              <label className="start-story-skip">
                <input
                  checked={skipStartPoint}
                  disabled={busy}
                  name="skip-start-point"
                  onChange={(event) => setSkipStartPoint(event.target.checked)}
                  type="checkbox"
                />
                <span>Создать проект без стартовой точки</span>
              </label>
            </section>

            <footer className="start-story-footer">
              <button className="start-story-primary" disabled={busy} onClick={handleConfirm} type="button">
                <Check size={17} aria-hidden="true" />
                {confirmMutation.isPending ? "Создается" : "Создать проект"}
              </button>
            </footer>
          </>
        )}
      </div>
    </AppShell>
  );
}
