import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, LoaderCircle, Save, Sparkles } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { memoryQueries, memoryQueryKeys } from "../../../entities/memory";
import { ProjectAgentSettingsCard } from "../../../entities/project-ai-settings";
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

const emptyDraft: StoryLineDraft = {
  type: "custom",
  title: "",
  description: "",
  current_state: "",
  status: "proposed",
  priority: 0,
};

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

  const summaryQuery = useQuery(memoryQueries.workspaceSummary(projectId));
  const lineQuery = useQuery(storyLineQueries.detail(projectId, lineId || null));
  const progressQuery = useQuery(storyLineQueries.progress(projectId, lineId || null));

  const summary = summaryQuery.data;
  const line = lineQuery.data;
  const readOnly = Boolean(summary?.runtime.read_only);
  const editLineLoading = !isCreate && lineQuery.isPending;
  const canAssist = !readOnly && !editLineLoading;
  const assistantBlockedReason = editLineLoading
    ? "Загрузка линии"
    : readOnly
      ? summary?.runtime.reason || "AI недоступен"
      : undefined;
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

        <ProjectAgentSettingsCard
          agentKey="story_line_generator"
          className="story-line-detail-panel"
          description="Применяется к помощнику, который собирает новую линию или предлагает правку."
          disabled={readOnly}
          projectId={projectId}
          title="Настройки ассистента линии"
        />

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
            {!canAssist && assistantBlockedReason && (
              <NoticeBlock tone="error">{assistantBlockedReason}</NoticeBlock>
            )}
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
