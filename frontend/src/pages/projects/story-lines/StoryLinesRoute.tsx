import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, History, Plus, Sparkles, X } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { memoryQueries, memoryQueryKeys } from "../../../entities/memory";
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
  updateStoryLine,
  updateStoryLineStatus,
  type StoryLine,
  type StoryLineFilters,
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
  const [draft, setDraft] = useState<StoryLineDraft>(emptyDraft);
  const [editingLine, setEditingLine] = useState<StoryLine | null>(null);
  const [suggestInstructions, setSuggestInstructions] = useState("");
  const [suggestions, setSuggestions] = useState<StoryLineSuggestion[]>([]);
  const [selectedProgressLine, setSelectedProgressLine] = useState<StoryLine | null>(null);

  const summaryQuery = useQuery(memoryQueries.workspaceSummary(projectId));
  const linesQuery = useQuery(storyLineQueries.list(projectId, filters));
  const progressQuery = useQuery(storyLineQueries.progress(projectId, selectedProgressLine?.id || null));

  const summary = summaryQuery.data;
  const readOnly = Boolean(summary?.runtime.read_only);
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
  const errors = [summaryQuery.error, linesQuery.error, progressQuery.error]
    .filter((error): error is Error => error instanceof Error)
    .map((error) => error.message);

  function invalidateLines() {
    void queryClient.invalidateQueries({ queryKey: storyLineQueryKeys.all });
    void queryClient.invalidateQueries({ queryKey: memoryQueryKeys.all });
  }

  const createMutation = useMutation({
    mutationFn: (payload: StoryLineDraft) => createStoryLine(projectId, draftToPayload(payload)),
    onSuccess: () => {
      setDraft(emptyDraft);
      invalidateLines();
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ lineId, payload }: { lineId: string; payload: StoryLineDraft }) =>
      updateStoryLine(projectId, lineId, draftToPayload(payload)),
    onSuccess: () => {
      setEditingLine(null);
      setDraft(emptyDraft);
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
      }),
    onSuccess: (result) => setSuggestions(result.story_lines),
  });

  function submitDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim() || readOnly) {
      return;
    }
    if (editingLine) {
      updateMutation.mutate({ lineId: editingLine.id, payload: draft });
      return;
    }
    createMutation.mutate(draft);
  }

  function beginEdit(line: StoryLine) {
    setEditingLine(line);
    setDraft(lineToDraft(line));
  }

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
              onEdit={beginEdit}
              onProgress={setSelectedProgressLine}
              onStatus={(line, status) => statusMutation.mutate({ lineId: line.id, status })}
              readOnly={readOnly}
              title="Активные"
              updating={statusMutation.isPending}
            />
            <LineGroup
              lines={groupedLines.proposed}
              onEdit={beginEdit}
              onProgress={setSelectedProgressLine}
              onStatus={(line, status) => statusMutation.mutate({ lineId: line.id, status })}
              readOnly={readOnly}
              title="Требуют решения"
              updating={statusMutation.isPending}
            />
            <LineGroup
              lines={groupedLines.sleeping}
              onEdit={beginEdit}
              onProgress={setSelectedProgressLine}
              onStatus={(line, status) => statusMutation.mutate({ lineId: line.id, status })}
              readOnly={readOnly}
              title="Спящие"
              updating={statusMutation.isPending}
            />
            <LineGroup
              lines={[...groupedLines.completed, ...groupedLines.rejected]}
              onEdit={beginEdit}
              onProgress={setSelectedProgressLine}
              onStatus={(line, status) => statusMutation.mutate({ lineId: line.id, status })}
              readOnly={readOnly}
              title="Закрытые"
              updating={statusMutation.isPending}
            />
          </main>

          <aside className="story-lines-route__side">
            <LineDraftForm
              draft={draft}
              mode={editingLine ? "edit" : "create"}
              onCancel={
                editingLine
                  ? () => {
                      setEditingLine(null);
                      setDraft(emptyDraft);
                    }
                  : undefined
              }
              onChange={setDraft}
              onSubmit={submitDraft}
              readOnly={readOnly}
              submitting={createMutation.isPending || updateMutation.isPending}
            />

            <section className="story-lines-panel" aria-label="AI-предложения линий">
              <div className="story-lines-panel__title">
                <Sparkles size={18} aria-hidden="true" />
                <h2>Предложить линии</h2>
              </div>
              <form
                className="story-lines-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!readOnly) {
                    suggestMutation.mutate();
                  }
                }}
              >
                <textarea
                  disabled={readOnly}
                  onChange={(event) => setSuggestInstructions(event.target.value)}
                  placeholder="Например: дай одну угрозу и одну линию отношений"
                  rows={4}
                  value={suggestInstructions}
                />
                <button disabled={readOnly || suggestMutation.isPending} type="submit">
                  <Sparkles size={15} aria-hidden="true" />
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

            <section className="story-lines-panel" aria-label="Прогресс линии">
              <div className="story-lines-panel__title">
                <History size={18} aria-hidden="true" />
                <h2>Прогресс</h2>
              </div>
              {!selectedProgressLine && <span className="story-lines-empty">выберите линию</span>}
              {selectedProgressLine && (
                <div className="story-lines-progress">
                  <strong>{selectedProgressLine.title}</strong>
                  {(progressQuery.data?.progress || []).map((item) => (
                    <div key={item.id}>
                      <span>{item.event_summary || "Изменение линии"}</span>
                      {item.after_state && <p>{item.after_state}</p>}
                    </div>
                  ))}
                  {progressQuery.data && progressQuery.data.progress.length === 0 && (
                    <span className="story-lines-empty">записей прогресса пока нет</span>
                  )}
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function LineGroup({
  lines,
  onEdit,
  onProgress,
  onStatus,
  readOnly,
  title,
  updating,
}: {
  lines: StoryLine[];
  onEdit: (line: StoryLine) => void;
  onProgress: (line: StoryLine) => void;
  onStatus: (line: StoryLine, status: StoryLineStatus) => void;
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
              <button disabled={readOnly} onClick={() => onEdit(line)} type="button">
                Правка
              </button>
              <button onClick={() => onProgress(line)} type="button">
                История
              </button>
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

function LineDraftForm({
  draft,
  mode,
  onCancel,
  onChange,
  onSubmit,
  readOnly,
  submitting,
}: {
  draft: StoryLineDraft;
  mode: "create" | "edit";
  onCancel?: () => void;
  onChange: (draft: StoryLineDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readOnly: boolean;
  submitting: boolean;
}) {
  return (
    <section className="story-lines-panel" aria-label={mode === "create" ? "Добавить линию" : "Правка линии"}>
      <div className="story-lines-panel__title">
        <Plus size={18} aria-hidden="true" />
        <h2>{mode === "create" ? "Добавить линию" : "Правка линии"}</h2>
      </div>
      <form className="story-lines-form" onSubmit={onSubmit}>
        <select
          disabled={readOnly}
          onChange={(event) => onChange({ ...draft, type: event.target.value as StoryLineType })}
          value={draft.type}
        >
          {storyLineTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          disabled={readOnly}
          onChange={(event) => onChange({ ...draft, status: event.target.value as StoryLineStatus })}
          value={draft.status}
        >
          {storyLineStatusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          disabled={readOnly}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
          placeholder="Название линии"
          value={draft.title}
        />
        <textarea
          disabled={readOnly}
          onChange={(event) => onChange({ ...draft, description: event.target.value })}
          placeholder="Зачем за ней следить"
          rows={3}
          value={draft.description}
        />
        <textarea
          disabled={readOnly}
          onChange={(event) => onChange({ ...draft, current_state: event.target.value })}
          placeholder="Текущее состояние"
          rows={3}
          value={draft.current_state}
        />
        <div className="story-lines-form__actions">
          <button disabled={readOnly || submitting || !draft.title.trim()} type="submit">
            {mode === "create" ? "Добавить" : "Сохранить"}
          </button>
          {onCancel && (
            <button onClick={onCancel} type="button">
              Отмена
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
