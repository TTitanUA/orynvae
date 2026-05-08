import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, ChevronLeft, Play, Sparkles } from "lucide-react";
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
  type ChapterUserRole,
} from "../../../entities/chapter";
import {
  memoryQueries,
  memoryQueryKeys,
  memoryStatusLabel,
  type MemoryItem,
} from "../../../entities/memory";
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

export function ChapterPrepareRoute({ projectId, chapterId }: ChapterPrepareRouteProps) {
  const queryClient = useQueryClient();
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(chapterId || null);
  const [draft, setDraft] = useState<PrepareDraft>(emptyDraft);
  const [result, setResult] = useState<ChapterPrepareResult | null>(null);

  const summaryQuery = useQuery(memoryQueries.workspaceSummary(projectId));
  const chaptersQuery = useQuery(chapterQueries.list(projectId));
  const charactersQuery = useQuery(memoryQueries.list(projectId, { type: "character" }));
  const linesQuery = useQuery(storyLineQueries.list(projectId));

  const summary = summaryQuery.data;
  const readOnly = Boolean(summary?.runtime.read_only);
  const chapters = chaptersQuery.data || [];
  const characters = (charactersQuery.data || []).filter((item) => item.status !== "rejected");
  const lines = (linesQuery.data || []).filter((line) => line.status !== "rejected");
  const defaultChapterId = chapterId || summary?.planned_chapter?.id || chapters[0]?.id || "";
  const effectiveChapterId = selectedChapterId ?? defaultChapterId;
  const selectedChapter = chapters.find((item) => item.id === effectiveChapterId) || null;
  const secondaryChoices = useMemo(
    () => lines.filter((line) => line.id !== draft.primary_story_line_id),
    [draft.primary_story_line_id, lines],
  );
  const errors = [summaryQuery.error, chaptersQuery.error, charactersQuery.error, linesQuery.error]
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

  function submitPrepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || draft.secondary_story_line_ids.length > 2) {
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
                {selectedChapter && (
                  <dl>
                    <div>
                      <dt>Статус</dt>
                      <dd>{selectedChapter.status}</dd>
                    </div>
                    <div>
                      <dt>Синопсис</dt>
                      <dd>{selectedChapter.synopsis || "не задан"}</dd>
                    </div>
                  </dl>
                )}
              </div>
            </section>

            <form className="chapter-prepare-form" onSubmit={submitPrepare}>
              <section className="chapter-prepare-panel">
                <div className="chapter-prepare-panel__title">
                  <Sparkles size={18} aria-hidden="true" />
                  <h2>Рамка сцены</h2>
                </div>
                <input
                  disabled={readOnly}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  placeholder={selectedChapter?.title || "Название главы"}
                  value={draft.title}
                />
                <textarea
                  disabled={readOnly}
                  onChange={(event) => setDraft({ ...draft, focus: event.target.value })}
                  placeholder="Фокус главы"
                  rows={3}
                  value={draft.focus}
                />
                <textarea
                  disabled={readOnly}
                  onChange={(event) => setDraft({ ...draft, start_point: event.target.value })}
                  placeholder="Стартовая ситуация"
                  rows={4}
                  value={draft.start_point}
                />
                <div className="chapter-prepare-form__grid">
                  <select
                    disabled={readOnly}
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
                  <input
                    disabled={readOnly}
                    onChange={(event) => setDraft({ ...draft, tone: event.target.value })}
                    placeholder="Тон"
                    value={draft.tone}
                  />
                  <select
                    disabled={readOnly}
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
                  <input
                    disabled={readOnly}
                    onChange={(event) =>
                      setDraft({ ...draft, expansion_policy_override: event.target.value })
                    }
                    placeholder="Свобода AI"
                    value={draft.expansion_policy_override}
                  />
                </div>
              </section>

              <section className="chapter-prepare-panel">
                <div className="chapter-prepare-panel__title">
                  <CheckCircle2 size={18} aria-hidden="true" />
                  <h2>Участники и линии</h2>
                </div>
                <SelectionList
                  empty="персонажей в памяти пока нет"
                  items={characters}
                  onToggle={toggleCharacter}
                  readOnly={readOnly}
                  selectedIds={draft.controlled_character_ids}
                  title="Управляемые персонажи"
                />
                <div className="chapter-line-focus">
                  <label>
                    Основная линия
                    <select
                      disabled={readOnly}
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
                    readOnly={readOnly}
                    selectedIds={draft.secondary_story_line_ids}
                  />
                </div>
                <button
                  className="chapter-prepare-submit"
                  disabled={readOnly || prepareMutation.isPending || draft.secondary_story_line_ids.length > 2}
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
        <p>{result.narrator_opening}</p>
      </article>
      {result.suggested_actions.length > 0 && (
        <article>
          <strong>Первые варианты</strong>
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
          {result.possible_line_movements.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </article>
      )}
      {result.coherence_risks.length > 0 && (
        <article>
          <strong>Риски связности</strong>
          {result.coherence_risks.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </article>
      )}
      <Link to={`/projects/${result.chapter.project_id}`}>Вернуться в проект</Link>
    </div>
  );
}
