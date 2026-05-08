import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Bot, CheckCircle2, ChevronLeft, Play, PlugZap, Sparkles } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  chapterPaceOptions,
  chapterQueries,
  chapterQueryKeys,
  chapterUserRoleOptions,
  createChapter,
  prepareChapterSession,
  type Chapter,
  type ChapterPace,
  type ChapterPrepareResult,
  type ChapterReasoningEffort,
  type ChapterUserRole,
} from "../../../entities/chapter";
import {
  memoryQueries,
  memoryQueryKeys,
  memoryStatusLabel,
  type MemoryItem,
} from "../../../entities/memory";
import {
  allowedModels,
  modelSupportsParameter,
  modelSupportsReasoning,
  providerQueries,
  selectableAiProviders,
} from "../../../entities/provider";
import {
  storyLineQueries,
  storyLineQueryKeys,
  storyLineStatusLabel,
  storyLineTypeLabel,
  type StoryLine,
} from "../../../entities/story-line";
import { NoticeBlock, StatusPill } from "../../../shared/ui";
import { AppShell } from "../../../widgets/app-shell";
import "./ChapterPrepareRoute.css";

type ChapterPrepareRouteProps = {
  projectId: string;
  chapterId?: string;
};

type PrepareDraft = {
  title: string;
  focus: string;
  user_role: ChapterUserRole;
  controlled_character_ids: string[];
  primary_story_line_id: string;
  secondary_story_line_ids: string[];
  tone: string;
  pace: ChapterPace | "";
  expansion_policy_override: string;
  start_point: string;
};

const emptyDraft: PrepareDraft = {
  title: "",
  focus: "",
  user_role: "unknown",
  controlled_character_ids: [],
  primary_story_line_id: "",
  secondary_story_line_ids: [],
  tone: "",
  pace: "",
  expansion_policy_override: "",
  start_point: "",
};

const reasoningEffortOptions: { value: ChapterReasoningEffort; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const userRoleHelp: Record<ChapterUserRole, string> = {
  single_character: "Подходит, если хочешь принимать решения за одного героя и проживать сцену ближе к нему.",
  multiple_characters: "Подходит, если в сцене важна группа и ты хочешь управлять несколькими решениями.",
  author: "Подходит, если хочешь направлять сцену сверху: задавать события, настроение и повороты.",
  unknown: "Нормальный выбор, если пока не ясно. Рассказчик предложит мягкий старт без жесткой роли.",
};

const paceHelp: Record<ChapterPace | "", string> = {
  "": "Можно не выбирать: рассказчик подстроит темп по стартовой ситуации.",
  slow: "Больше внимания ощущениям, деталям и внутреннему напряжению.",
  medium: "Баланс между атмосферой, решениями и движением событий.",
  fast: "Больше действия и быстрых последствий, меньше долгих описаний.",
  user_choice: "Рассказчик будет чаще оставлять выбор темпа тебе во время сцены.",
};

const reasoningHelp: Record<ChapterReasoningEffort | "", string> = {
  "": "Auto оставляет выбор модели. Это хороший вариант по умолчанию.",
  low: "Быстрее и проще, если задача понятная и не требует сложной связности.",
  medium: "Больше внимания причинно-следственным связям без сильного замедления.",
  high: "Полезно для сложных сцен с тайнами, конфликтами и несколькими линиями.",
};

export function ChapterPrepareRoute({ projectId, chapterId }: ChapterPrepareRouteProps) {
  const queryClient = useQueryClient();
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(chapterId || null);
  const [draft, setDraft] = useState<PrepareDraft>(emptyDraft);
  const [result, setResult] = useState<ChapterPrepareResult | null>(null);
  const [selectedProviderIdDraft, setSelectedProviderId] = useState("");
  const [selectedModelIdDraft, setSelectedModelId] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(0.9);
  const [reasoningEffort, setReasoningEffort] = useState<ChapterReasoningEffort | "">("");

  const summaryQuery = useQuery(memoryQueries.workspaceSummary(projectId));
  const chaptersQuery = useQuery(chapterQueries.list(projectId));
  const charactersQuery = useQuery(memoryQueries.list(projectId, { type: "character" }));
  const linesQuery = useQuery(storyLineQueries.list(projectId));
  const providersQuery = useQuery(providerQueries.list());

  const summary = summaryQuery.data;
  const readOnly = Boolean(summary?.runtime.read_only);
  const chapters = chaptersQuery.data || [];
  const characters = (charactersQuery.data || []).filter((item) => item.status !== "rejected");
  const lines = (linesQuery.data || []).filter((line) => line.status !== "rejected");
  const providers = useMemo(() => providersQuery.data || [], [providersQuery.data]);
  const selectableProviders = useMemo(() => selectableAiProviders(providers), [providers]);
  const projectProviderId = summary?.project.active_provider_id || summary?.runtime.active_provider?.id;
  const projectProvider = selectableProviders.find((provider) => provider.id === projectProviderId);
  const defaultProvider = selectableProviders.find((provider) => provider.is_default);
  const selectedProviderId =
    selectedProviderIdDraft || (projectProvider || defaultProvider || selectableProviders[0])?.id || "";
  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId),
    [providers, selectedProviderId],
  );
  const models = useMemo(() => allowedModels(selectedProvider), [selectedProvider]);
  const projectModelId =
    selectedProvider?.id === projectProviderId
      ? summary?.project.active_model_id || summary?.runtime.active_model?.model_id
      : undefined;
  const projectModel = models.find((model) => model.model_id === projectModelId);
  const defaultModel = models.find((model) => model.model_id === selectedProvider?.default_model_id);
  const fallbackModelId = (projectModel || defaultModel || models[0])?.model_id || "";
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
  const selectedModelReady = Boolean(selectedProviderAvailable && selectedProvider && selectedModel);
  const modelBlockedReason =
    providersQuery.isPending
      ? "Загрузка моделей"
      : !selectedProvider
        ? summary?.runtime.reason || "Выбери AI-провайдер"
        : !selectedModel
          ? "Выбери разрешенную модель"
          : selectedProvider.last_error || undefined;
  const activeProviderLabel =
    selectedProvider && selectedModel ? `${selectedProvider.name} · ${selectedModel.display_name}` : "AI не выбран";
  const defaultChapterId = chapterId || summary?.planned_chapter?.id || chapters[0]?.id || "";
  const effectiveChapterId = selectedChapterId ?? defaultChapterId;
  const selectedChapter = chapters.find((item) => item.id === effectiveChapterId) || null;
  const secondaryChoices = useMemo(
    () => lines.filter((line) => line.id !== draft.primary_story_line_id),
    [draft.primary_story_line_id, lines],
  );
  const errors = [
    summaryQuery.error,
    chaptersQuery.error,
    charactersQuery.error,
    linesQuery.error,
    providersQuery.error,
  ]
    .filter((error): error is Error => error instanceof Error)
    .map((error) => error.message);

  const prepareMutation = useMutation({
    mutationFn: async () => {
      let targetChapter: Chapter | null = selectedChapter;
      if (!targetChapter) {
        targetChapter = await createChapter(projectId, {
          title: draft.title.trim() || null,
          synopsis: draft.focus.trim() || draft.start_point.trim() || null,
        });
      }
      return prepareChapterSession(projectId, targetChapter.id, {
        title: draft.title.trim() || null,
        focus: draft.focus.trim() || null,
        user_role: draft.user_role,
        controlled_character_ids: draft.controlled_character_ids,
        primary_story_line_id: draft.primary_story_line_id || null,
        secondary_story_line_ids: draft.secondary_story_line_ids,
        ignored_story_line_ids: [],
        tone: draft.tone.trim() || null,
        pace: draft.pace || null,
        expansion_policy_override: draft.expansion_policy_override.trim() || null,
        start_point: draft.start_point.trim() || null,
        provider_id: selectedProviderId,
        model_id: selectedModelId,
        temperature: supportsTemperature ? temperature : 0.7,
        top_p: supportsTopP ? topP : null,
        reasoning_effort: supportsModelReasoning && reasoningEffort ? reasoningEffort : null,
      });
    },
    onSuccess: (prepared) => {
      setResult(prepared);
      setSelectedChapterId(prepared.chapter.id);
      void queryClient.invalidateQueries({ queryKey: chapterQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: memoryQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: storyLineQueryKeys.all });
    },
  });
  const busy = prepareMutation.isPending;
  const canPrepare = !readOnly && selectedModelReady && draft.secondary_story_line_ids.length <= 2;

  function submitPrepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canPrepare || busy) {
      return;
    }
    prepareMutation.mutate();
  }

  function toggleCharacter(characterId: string) {
    const selected = draft.controlled_character_ids.includes(characterId);
    setDraft({
      ...draft,
      controlled_character_ids: selected
        ? draft.controlled_character_ids.filter((item) => item !== characterId)
        : [...draft.controlled_character_ids, characterId],
    });
  }

  function toggleSecondaryLine(lineId: string) {
    const selected = draft.secondary_story_line_ids.includes(lineId);
    const next = selected
      ? draft.secondary_story_line_ids.filter((item) => item !== lineId)
      : [...draft.secondary_story_line_ids, lineId].slice(0, 2);
    setDraft({ ...draft, secondary_story_line_ids: next });
  }

  return (
    <AppShell>
      <div className="chapter-prepare-route">
        <header className="chapter-prepare-route__header">
          <div>
            <Link className="chapter-prepare-route__back" to={`/projects/${projectId}`}>
              <ChevronLeft size={16} aria-hidden="true" />
              Проект
            </Link>
            <h1>Подготовка главы</h1>
            <p>{summary?.project.title || "Текущий проект"}</p>
          </div>
          <div className="chapter-prepare-route__status">
            <StatusPill label={readOnly ? "Только чтение" : "AI доступен"} tone={readOnly ? "warning" : "ready"} />
            <Link to={`/projects/${projectId}/story-lines`}>Линии истории</Link>
          </div>
        </header>

        {errors.map((error) => (
          <NoticeBlock key={error} tone="error">
            {error}
          </NoticeBlock>
        ))}
        {summary?.warnings.map((warning) => <NoticeBlock key={warning}>{warning}</NoticeBlock>)}

        <div className="chapter-prepare-route__layout">
          <main className="chapter-prepare-main">
            <section className="chapter-prepare-panel">
              <div className="chapter-prepare-panel__title">
                <BookOpen size={18} aria-hidden="true" />
                <h2>Глава</h2>
              </div>
              <p className="chapter-panel-help">
                Здесь выбирается, какую главу готовит рассказчик. Это еще не финальный текст, а
                договоренность о следующей интерактивной сцене.
              </p>
              <div className="chapter-selector">
                <select
                  aria-label="Выбрать главу"
                  onChange={(event) => setSelectedChapterId(event.target.value)}
                  value={effectiveChapterId}
                >
                  <option value="">Новая глава</option>
                  {chapters.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      {chapter.order_index}. {chapter.title}
                    </option>
                  ))}
                </select>
                <p className="chapter-help">
                  Если выбрать новую главу, Orynvae создаст ее перед подготовкой. Если выбрать
                  существующую, AI будет опираться на ее сохраненный синопсис.
                </p>
                {selectedChapter && (
                  <dl>
                    <div>
                      <dt>Статус</dt>
                      <dd>
                        <span>{selectedChapter.status}</span>
                        <small>Показывает, на каком этапе сейчас глава: план, сессия, черновик или завершение.</small>
                      </dd>
                    </div>
                    <div>
                      <dt>Синопсис</dt>
                      <dd>
                        <span>{selectedChapter.synopsis || "не задан"}</span>
                        <small>Короткая память главы. Рассказчик учитывает ее, чтобы старт не противоречил уже выбранному направлению.</small>
                      </dd>
                    </div>
                  </dl>
                )}
              </div>
            </section>

            <form className="chapter-prepare-form" onSubmit={submitPrepare}>
              <section className="chapter-prepare-panel chapter-model-config" aria-label="Настройки модели">
                <div className="chapter-model-config__header">
                  <div className="chapter-prepare-panel__title">
                    <Bot size={18} aria-hidden="true" />
                    <h2>Модель ассистента</h2>
                  </div>
                  <span>{activeProviderLabel}</span>
                  {!selectedModelReady && (
                    <Link
                      aria-label="Настроить AI"
                      className="chapter-model-config__settings"
                      title="Настроить AI"
                      to="/settings/providers"
                    >
                      <PlugZap size={16} aria-hidden="true" />
                    </Link>
                  )}
                </div>
                {!readOnly && !selectedModelReady && modelBlockedReason && (
                  <NoticeBlock tone="error">{modelBlockedReason}</NoticeBlock>
                )}
                <p className="chapter-panel-help">
                  Это “голос и мозг” рассказчика для подготовки. Настройки ниже влияют только на
                  AI-подготовку этой главы и не меняют уже сохраненный текст.
                </p>
                <div className="chapter-prepare-form__grid">
                  <label className="chapter-field">
                    <span>Провайдер</span>
                    <small>Где запускается модель: локально на твоем компьютере или во внешнем сервисе.</small>
                    <select
                      disabled={readOnly || busy || providersQuery.isPending}
                      name="chapter-prepare-provider"
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
                  <label className="chapter-field">
                    <span>Модель</span>
                    <small>Конкретная модель, которая будет думать над стартом сцены и первыми вариантами действий.</small>
                    <select
                      disabled={readOnly || busy || !selectedProvider}
                      name="chapter-prepare-model"
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

                <div className="chapter-parameter-grid">
                  {supportsTemperature && (
                    <label className="chapter-range">
                      <span>Температура</span>
                      <small>Ниже - спокойнее и предсказуемее. Выше - смелее, образнее и рискованнее.</small>
                      <input
                        aria-label="Температура"
                        disabled={readOnly || busy}
                        max="2"
                        min="0"
                        name="chapter-prepare-temperature"
                        onChange={(event) => setTemperature(Number(event.target.value))}
                        step="0.05"
                        type="range"
                        value={temperature}
                      />
                      <output>{temperature.toFixed(2)}</output>
                    </label>
                  )}
                  {supportsTopP && (
                    <label className="chapter-range">
                      <span>Top P</span>
                      <small>Сужает или расширяет выбор слов и идей. Если не уверен, оставь около 0.90.</small>
                      <input
                        aria-label="Top P"
                        disabled={readOnly || busy}
                        max="1"
                        min="0"
                        name="chapter-prepare-top-p"
                        onChange={(event) => setTopP(Number(event.target.value))}
                        step="0.05"
                        type="range"
                        value={topP}
                      />
                      <output>{topP.toFixed(2)}</output>
                    </label>
                  )}
                  {supportsModelReasoning && (
                    <label className="chapter-field">
                      <span>Reasoning</span>
                      <small>{reasoningHelp[reasoningEffort]}</small>
                      <select
                        aria-label="Reasoning"
                        disabled={readOnly || busy}
                        name="chapter-prepare-reasoning"
                        onChange={(event) =>
                          setReasoningEffort(event.target.value as ChapterReasoningEffort | "")
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

              <section className="chapter-prepare-panel">
                <div className="chapter-prepare-panel__title">
                  <Sparkles size={18} aria-hidden="true" />
                  <h2>Рамка сцены</h2>
                </div>
                <p className="chapter-panel-help">
                  Здесь не нужно писать план главы. Достаточно подсказать рассказчику, с какой
                  эмоции, ситуации или маленькой проблемы начать.
                </p>
                <label className="chapter-field">
                  <span>Название главы</span>
                  <small>Можно оставить пустым: AI возьмет текущее название или поможет найти его позже.</small>
                  <input
                    disabled={readOnly || busy}
                    onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                    placeholder={selectedChapter?.title || "Например: Встреча у реки"}
                    value={draft.title}
                  />
                </label>
                <label className="chapter-field">
                  <span>Фокус главы</span>
                  <small>О чем должна быть сцена простыми словами: доверие, тайна, ссора, первый след, опасность.</small>
                  <textarea
                    disabled={readOnly || busy}
                    onChange={(event) => setDraft({ ...draft, focus: event.target.value })}
                    placeholder="Например: показать, почему брату трудно радоваться вместе с сестрой"
                    rows={3}
                    value={draft.focus}
                  />
                </label>
                <label className="chapter-field">
                  <span>Стартовая ситуация</span>
                  <small>С какой картинки начать: где герои, что уже происходит и что немного не так.</small>
                  <textarea
                    disabled={readOnly || busy}
                    onChange={(event) => setDraft({ ...draft, start_point: event.target.value })}
                    placeholder="Например: сестра собирается к реке, а брат делает вид, что ему все равно"
                    rows={4}
                    value={draft.start_point}
                  />
                </label>
                <div className="chapter-prepare-form__grid">
                  <label className="chapter-field">
                    <span>Кем ты будешь в главе</span>
                    <small>{userRoleHelp[draft.user_role]}</small>
                    <select
                      disabled={readOnly || busy}
                      onChange={(event) =>
                        setDraft({ ...draft, user_role: event.target.value as ChapterUserRole })
                      }
                      value={draft.user_role}
                    >
                      {chapterUserRoleOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="chapter-field">
                    <span>Тон</span>
                    <small>Настроение сцены: теплый, тревожный, бытовой, мистический, резкий, тихий.</small>
                    <input
                      disabled={readOnly || busy}
                      onChange={(event) => setDraft({ ...draft, tone: event.target.value })}
                      placeholder="Например: напряженный, но летний"
                      value={draft.tone}
                    />
                  </label>
                  <label className="chapter-field">
                    <span>Темп</span>
                    <small>{paceHelp[draft.pace]}</small>
                    <select
                      disabled={readOnly || busy}
                      onChange={(event) => setDraft({ ...draft, pace: event.target.value as ChapterPace | "" })}
                      value={draft.pace}
                    >
                      <option value="">Темп не задан</option>
                      {chapterPaceOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="chapter-field">
                    <span>Свобода AI</span>
                    <small>Напиши ограничение для этой главы, если важно: не раскрывать тайну, не вводить новых героев, держать сцену бытовой.</small>
                    <input
                      disabled={readOnly || busy}
                      onChange={(event) =>
                        setDraft({ ...draft, expansion_policy_override: event.target.value })
                      }
                      placeholder="Например: не решать конфликт за брата"
                      value={draft.expansion_policy_override}
                    />
                  </label>
                </div>
              </section>

              <section className="chapter-prepare-panel">
                <div className="chapter-prepare-panel__title">
                  <CheckCircle2 size={18} aria-hidden="true" />
                  <h2>Участники и линии</h2>
                </div>
                <p className="chapter-panel-help">
                  Этот блок говорит рассказчику, кто сейчас важен и какие долгие нити истории
                  можно слегка продвинуть. Не нужно выбирать всех персонажей сразу.
                </p>
                <SelectionList
                  empty="персонажей в памяти пока нет"
                  items={characters}
                  onToggle={toggleCharacter}
                  readOnly={readOnly || busy}
                  selectedIds={draft.controlled_character_ids}
                  title="Управляемые персонажи"
                />
                <div className="chapter-line-focus">
                  <label className="chapter-field">
                    <span>Основная линия</span>
                    <small>Главная нить главы. Если выбрать линию, AI постарается дать ей заметный шаг вперед.</small>
                    <select
                      disabled={readOnly || busy}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          primary_story_line_id: event.target.value,
                          secondary_story_line_ids: draft.secondary_story_line_ids.filter(
                            (lineId) => lineId !== event.target.value,
                          ),
                        })
                      }
                      value={draft.primary_story_line_id}
                    >
                      <option value="">Не фокусироваться</option>
                      {lines.map((line) => (
                        <option key={line.id} value={line.id}>
                          {line.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <LineSelectionList
                    lines={secondaryChoices}
                    onToggle={toggleSecondaryLine}
                    readOnly={readOnly || busy}
                    selectedIds={draft.secondary_story_line_ids}
                  />
                </div>
                <p className="chapter-submit-help">
                  После нажатия AI не пишет главу целиком. Он подготовит старт сцены, первые
                  варианты действий и напомнит о рисках связности.
                </p>
                <button
                  className="chapter-prepare-submit"
                  disabled={!canPrepare || busy}
                  type="submit"
                >
                  <Play size={16} aria-hidden="true" />
                  Подготовить с AI
                </button>
              </section>
            </form>
          </main>

          <aside className="chapter-prepare-side">
            <section className="chapter-prepare-panel" aria-label="Результат подготовки">
              <div className="chapter-prepare-panel__title">
                <Sparkles size={18} aria-hidden="true" />
                <h2>Результат</h2>
              </div>
              <p className="chapter-panel-help">
                Здесь появится мягкий план входа в сцену: что рассказчик понял, с чего начать и
                какие варианты действий можно попробовать.
              </p>
              {prepareMutation.error instanceof Error && (
                <NoticeBlock tone="error">{prepareMutation.error.message}</NoticeBlock>
              )}
              {!result && <span className="chapter-prepare-empty">AI-подготовка появится здесь</span>}
              {result && <PrepareResult result={result} />}
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function SelectionList({
  empty,
  items,
  onToggle,
  readOnly,
  selectedIds,
  title,
}: {
  empty: string;
  items: MemoryItem[];
  onToggle: (id: string) => void;
  readOnly: boolean;
  selectedIds: string[];
  title: string;
}) {
  return (
    <fieldset className="chapter-choice-list">
      <legend>{title}</legend>
      <p className="chapter-help">
        Отмеченные персонажи становятся твоей зоной решений. Рассказчик не должен решать за них
        важные поступки без твоего хода.
      </p>
      {items.map((item) => (
        <label key={item.id}>
          <input
            checked={selectedIds.includes(item.id)}
            disabled={readOnly}
            onChange={() => onToggle(item.id)}
            type="checkbox"
          />
          <span>
            <strong>{item.title}</strong>
            <em>{memoryStatusLabel(item.status)}</em>
            <small>Статус показывает, насколько этот персонаж закреплен в памяти истории.</small>
          </span>
        </label>
      ))}
      {items.length === 0 && <span className="chapter-prepare-empty">{empty}</span>}
    </fieldset>
  );
}

function LineSelectionList({
  lines,
  onToggle,
  readOnly,
  selectedIds,
}: {
  lines: StoryLine[];
  onToggle: (id: string) => void;
  readOnly: boolean;
  selectedIds: string[];
}) {
  return (
    <fieldset className="chapter-choice-list">
      <legend>Вторичные линии</legend>
      <p className="chapter-help">
        Дополнительные нити можно затронуть фоном. Лучше выбрать не больше двух, чтобы сцена не
        распалась на слишком много задач.
      </p>
      {lines.map((line) => (
        <label key={line.id}>
          <input
            checked={selectedIds.includes(line.id)}
            disabled={readOnly || (!selectedIds.includes(line.id) && selectedIds.length >= 2)}
            onChange={() => onToggle(line.id)}
            type="checkbox"
          />
          <span>
            <strong>{line.title}</strong>
            <em>
              {storyLineTypeLabel(line.type)} · {storyLineStatusLabel(line.status)}
            </em>
            <small>Тип показывает, о чем линия; статус показывает, насколько активно она сейчас развивается.</small>
          </span>
        </label>
      ))}
      {lines.length === 0 && <span className="chapter-prepare-empty">других линий пока нет</span>}
    </fieldset>
  );
}

function PrepareResult({ result }: { result: ChapterPrepareResult }) {
  return (
    <div className="chapter-result">
      <StatusPill label="Сессия подготовлена" tone="ready" />
      {result.chapter_intention && <p>{result.chapter_intention}</p>}
      {result.start_situation && <p>{result.start_situation}</p>}
      <article>
        <strong>Открытие рассказчика</strong>
        <small>Первый кусок сцены. От него можно отвечать действием, репликой или авторской правкой.</small>
        <p>{result.narrator_opening}</p>
      </article>
      {result.suggested_actions.length > 0 && (
        <article>
          <strong>Первые варианты</strong>
          <small>Это не обязательный выбор. Их можно взять, изменить, смешать или проигнорировать.</small>
          {result.suggested_actions.map((action) => (
            <div key={action.label}>
              <span>{action.label}</span>
              <p>{action.action}</p>
            </div>
          ))}
        </article>
      )}
      {result.possible_line_movements.length > 0 && (
        <article>
          <strong>Линии</strong>
          <small>Какие долгие нити истории могут сдвинуться, если начать с этой сцены.</small>
          {result.possible_line_movements.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </article>
      )}
      {result.coherence_risks.length > 0 && (
        <article>
          <strong>Риски связности</strong>
          <small>Места, где рассказчик предлагает быть внимательнее, чтобы история не спорила сама с собой.</small>
          {result.coherence_risks.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </article>
      )}
      <Link to={`/projects/${result.chapter.project_id}`}>Вернуться в проект</Link>
    </div>
  );
}
