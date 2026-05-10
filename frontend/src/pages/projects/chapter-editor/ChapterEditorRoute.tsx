import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Check,
  ChevronLeft,
  FileText,
  GitBranch,
  LoaderCircle,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { Link, useBeforeUnload, useBlocker } from "react-router-dom";

import { chapterQueries, chapterQueryKeys, chapterStatusLabel } from "../../../entities/chapter";
import {
  draftMutations,
  draftQueries,
  draftQueryKeys,
  draftStatusLabel,
  type DraftAssistActionKey,
} from "../../../entities/draft";
import { memoryQueries, memoryQueryKeys, memoryTypeLabel } from "../../../entities/memory";
import { narratorSessionQueries } from "../../../entities/narrator-session";
import { ProjectAgentSettingsCard } from "../../../entities/project-ai-settings";
import { storyLineQueries } from "../../../entities/story-line";
import {
  OrynvaeMarkdownEditor,
  useChapterEditorV2Store,
  type EditorAgentMetadata,
  type OrynvaeEditorGateway,
} from "../../../features/edit-chapter";
import { NoticeBlock, StatusPill } from "../../../shared/ui";
import { AppShell } from "../../../widgets/app-shell";
import "./ChapterEditorRoute.css";

type ChapterEditorRouteProps = {
  chapterId: string;
  projectId: string;
};

type AssistantAction = {
  key: DraftAssistActionKey;
  label: string;
  instruction: string;
  scope: "selection" | "document";
};

const selectionActions: AssistantAction[] = [
  {
    key: "rewrite_simpler",
    label: "Проще",
    instruction: "Перепиши выделение проще, без потери смысла.",
    scope: "selection",
  },
  {
    key: "rewrite_expressive",
    label: "Выразительнее",
    instruction: "Сделай выделение более выразительным и художественным.",
    scope: "selection",
  },
  {
    key: "improve_dialogue",
    label: "Диалог",
    instruction: "Если в выделении есть реплики, сделай их естественнее и различимее.",
    scope: "selection",
  },
  {
    key: "add_atmosphere",
    label: "Атмосфера",
    instruction: "Добавь атмосферу, не добавляя неподтвержденный канон.",
    scope: "selection",
  },
  {
    key: "shorten",
    label: "Сократить",
    instruction: "Сократи выделение и сохрани ключевое действие.",
    scope: "selection",
  },
];

const documentActions: AssistantAction[] = [
  {
    key: "check_coherence",
    label: "Связность",
    instruction: "Проверь связность текущего черновика и предложи минимальную markdown-правку.",
    scope: "document",
  },
  {
    key: "improve_rhythm",
    label: "Ритм",
    instruction: "Улучши ритм текущего черновика без изменения фактов.",
    scope: "document",
  },
];

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "нет даты";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function latestByCreated<T extends { created_at: string }>(items: T[]): T | null {
  return [...items].sort((left, right) => right.created_at.localeCompare(left.created_at))[0] || null;
}

function includesEvent(markdown: string, title: string, summary: string | null): boolean {
  const haystack = markdown.toLocaleLowerCase();
  return [title, summary]
    .filter((value): value is string => Boolean(value?.trim()))
    .some((value) => haystack.includes(value.toLocaleLowerCase()));
}

export function ChapterEditorRoute({ chapterId, projectId }: ChapterEditorRouteProps) {
  const queryClient = useQueryClient();
  const gatewayRef = useRef<OrynvaeEditorGateway | null>(null);
  const loadedDocumentKeyRef = useRef<string | null>(null);
  const suggestionCounterRef = useRef(0);

  const summaryQuery = useQuery(memoryQueries.workspaceSummary(projectId));
  const chapterQuery = useQuery(chapterQueries.detail(projectId, chapterId));
  const versionsQuery = useQuery(draftQueries.versions(projectId, chapterId));
  const memoryQuery = useQuery(memoryQueries.list(projectId, { status: "canon" }));
  const storyLinesQuery = useQuery(storyLineQueries.list(projectId, { status: "active" }));
  const chapter = chapterQuery.data;
  const sessionQuery = useQuery(narratorSessionQueries.detail(chapter?.session_id || ""));

  const markdown = useChapterEditorV2Store((state) => state.markdown);
  const dirty = useChapterEditorV2Store((state) => state.dirty);
  const selection = useChapterEditorV2Store((state) => state.selection);
  const suggestion = useChapterEditorV2Store((state) => state.suggestion);
  const setActiveActionKey = useChapterEditorV2Store((state) => state.setActiveActionKey);
  const setLoadedMarkdown = useChapterEditorV2Store((state) => state.setLoadedMarkdown);
  const setMarkdown = useChapterEditorV2Store((state) => state.setMarkdown);
  const markSaved = useChapterEditorV2Store((state) => state.markSaved);
  const setSelection = useChapterEditorV2Store((state) => state.setSelection);
  const setSuggestion = useChapterEditorV2Store((state) => state.setSuggestion);
  const resetEditor = useChapterEditorV2Store((state) => state.reset);

  const latestDraft = useMemo(() => latestByCreated(versionsQuery.data || []), [versionsQuery.data]);
  const readOnly = Boolean(summaryQuery.data?.runtime.read_only);
  const sourceMarkdown = latestDraft?.markdown || chapter?.draft_markdown || "";
  const documentKey = `${projectId}:${chapterId}:${latestDraft?.id || "chapter-draft"}`;
  const busy = summaryQuery.isPending || chapterQuery.isPending || versionsQuery.isPending;
  const errors = [
    summaryQuery.error,
    chapterQuery.error,
    versionsQuery.error,
    memoryQuery.error,
    storyLinesQuery.error,
    sessionQuery.error,
  ]
    .filter((error): error is Error => error instanceof Error)
    .map((error) => error.message);

  useEffect(() => {
    if (!chapter || loadedDocumentKeyRef.current === documentKey) {
      return;
    }
    loadedDocumentKeyRef.current = documentKey;
    setLoadedMarkdown(sourceMarkdown);
  }, [chapter, documentKey, setLoadedMarkdown, sourceMarkdown]);

  useEffect(() => {
    return () => {
      resetEditor();
      loadedDocumentKeyRef.current = null;
    };
  }, [resetEditor]);

  useBeforeUnload((event) => {
    if (!dirty) {
      return;
    }
    event.preventDefault();
    event.returnValue = "";
  });

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    return dirty && currentLocation.pathname !== nextLocation.pathname;
  });

  function invalidateEditorData() {
    void queryClient.invalidateQueries({ queryKey: chapterQueryKeys.detail(projectId, chapterId) });
    void queryClient.invalidateQueries({ queryKey: draftQueryKeys.versions(projectId, chapterId) });
    void queryClient.invalidateQueries({ queryKey: memoryQueryKeys.workspaceSummary(projectId) });
  }

  const updateMutation = useMutation({
    ...draftMutations.update(projectId, chapterId),
    onSuccess: (response) => {
      markSaved(response.draft_version.markdown);
      invalidateEditorData();
    },
  });
  const assistMutation = useMutation({
    ...draftMutations.assist(projectId, chapterId),
    onSuccess: (response, payload) => {
      const range = payload.selection_range || { from: 0, to: markdown.length };
      const originalMarkdown = markdown.slice(range.from, range.to);
      suggestionCounterRef.current += 1;
      const suggestionId = `suggestion-${suggestionCounterRef.current}`;
      setSuggestion({
        id: suggestionId,
        actionKey: payload.action_key || "rewrite_expressive",
        scope: payload.scope || "selection",
        originalMarkdown,
        replacementMarkdown: response.replacement_markdown,
        rationale: response.rationale,
        warnings: response.warnings,
        from: range.from,
        to: range.to,
      });
      gatewayRef.current?.showInlineSuggestion({
        id: suggestionId,
        from: range.from,
        to: range.to,
        text: response.replacement_markdown,
      });
    },
  });

  const selectedText = selection?.text || "";
  const canUseSelectionAssist = Boolean(!readOnly && selection && !selection.isEmpty && selectedText.trim());
  const canUseDocumentAssist = Boolean(!readOnly && markdown.trim());
  const modelLabel =
    summaryQuery.data?.runtime.active_model?.display_name ||
    summaryQuery.data?.runtime.reason ||
    "модель не выбрана";

  function saveMarkdown() {
    const current = gatewayRef.current?.getMarkdown() ?? markdown;
    if (readOnly || updateMutation.isPending || !current.trim()) {
      return;
    }
    updateMutation.mutate({ markdown: current, mode: latestDraft?.mode || "literary", status: "edited" });
  }

  function runAssistant(action: AssistantAction) {
    const currentMarkdown = gatewayRef.current?.getMarkdown() ?? markdown;
    const currentSelection = gatewayRef.current?.getSelection() ?? selection;
    if (readOnly || assistMutation.isPending || !currentMarkdown.trim()) {
      return;
    }
    const range =
      action.scope === "document"
        ? { from: 0, to: currentMarkdown.length }
        : currentSelection
          ? { from: currentSelection.from, to: currentSelection.to }
          : null;
    if (!range || range.from === range.to) {
      return;
    }
    const selectedMarkdown = currentMarkdown.slice(range.from, range.to);
    if (!selectedMarkdown.trim()) {
      return;
    }
    setActiveActionKey(action.key);
    assistMutation.mutate({
      scope: action.scope,
      action_key: action.key,
      selection_markdown: selectedMarkdown,
      selection_range: range,
      draft_markdown: currentMarkdown,
      source_draft_version_id: latestDraft?.id || null,
      related_story_line_ids: (storyLinesQuery.data || []).map((line) => line.id),
      instructions: action.instruction,
    });
  }

  function acceptSuggestion() {
    if (!suggestion || readOnly) {
      return;
    }
    const metadata: EditorAgentMetadata = {
      projectId,
      chapterId,
      sessionId: chapter?.session_id || null,
      draftVersionId: latestDraft?.id || null,
      agentActionType: suggestion.actionKey,
      relatedStoryLineIds: (storyLinesQuery.data || []).map((line) => line.id),
      createdAt: new Date().toISOString(),
    };
    gatewayRef.current?.applyAgentSuggestion({
      suggestionId: suggestion.id,
      from: suggestion.from,
      to: suggestion.to,
      text: suggestion.replacementMarkdown,
      metadata,
    });
    setSuggestion(null);
  }

  function rejectSuggestion() {
    if (suggestion) {
      gatewayRef.current?.clearInlineSuggestion(suggestion.id);
    }
    setSuggestion(null);
  }

  const reviewHref = `/projects/${projectId}/chapters/${chapterId}/review`;
  const draftHref = chapter?.session_id
    ? `/projects/${projectId}/sessions/${chapter.session_id}/draft`
    : `/projects/${projectId}/chapters`;

  return (
    <AppShell>
      <div className="chapter-editor-route">
        <header className="chapter-editor-route__header">
          <div>
            <Link className="chapter-editor-route__back" to={`/projects/${projectId}/chapters`}>
              <ChevronLeft size={16} aria-hidden="true" />
              Главы
            </Link>
            <h1>{chapter?.title || "Редактор главы"}</h1>
            <p>{summaryQuery.data?.project.title || "История"}</p>
          </div>
          <div className="chapter-editor-route__status">
            <StatusPill label={readOnly ? "Только чтение" : "AI доступен"} tone={readOnly ? "warning" : "ready"} />
            <span>{modelLabel}</span>
            {dirty && <strong>есть несохраненные правки</strong>}
          </div>
        </header>

        {busy && <NoticeBlock>Загрузка редактора</NoticeBlock>}
        {errors.map((error) => (
          <NoticeBlock key={error} tone="error">
            {error}
          </NoticeBlock>
        ))}
        {readOnly && <NoticeBlock>Редактор открыт только для чтения, пока AI недоступен.</NoticeBlock>}
        {updateMutation.error instanceof Error && <NoticeBlock tone="error">{updateMutation.error.message}</NoticeBlock>}
        {assistMutation.error instanceof Error && <NoticeBlock tone="error">{assistMutation.error.message}</NoticeBlock>}

        {chapter && (
          <>
            <section className="chapter-editor-toolbar" aria-label="Действия редактора">
              <div className="chapter-editor-toolbar__facts">
                <span>{chapterStatusLabel(chapter.status)}</span>
                <span>{latestDraft ? draftStatusLabel(latestDraft.status) : "черновик главы"}</span>
                <span>обновлена {formatTimestamp(chapter.updated_at)}</span>
              </div>
              <div className="chapter-editor-toolbar__actions">
                <Link to={draftHref}>
                  <FileText size={15} aria-hidden="true" />
                  Сборка
                </Link>
                <Link to={reviewHref}>
                  <GitBranch size={15} aria-hidden="true" />
                  Разбор
                </Link>
                <button disabled={readOnly || updateMutation.isPending || !dirty} onClick={saveMarkdown} type="button">
                  {updateMutation.isPending ? (
                    <LoaderCircle className="is-spinning" size={15} aria-hidden="true" />
                  ) : (
                    <Save size={15} aria-hidden="true" />
                  )}
                  Сохранить
                </button>
              </div>
            </section>

            <main className="chapter-editor-layout">
              <section className="chapter-editor-surface" aria-label="Markdown редактор">
                <OrynvaeMarkdownEditor
                  ariaLabel="Markdown черновика главы"
                  documentKey={documentKey}
                  markdown={markdown}
                  onChange={setMarkdown}
                  onGatewayReady={(gateway) => {
                    gatewayRef.current = gateway;
                  }}
                  onSelectionChange={setSelection}
                  readOnly={readOnly}
                />
              </section>

              <aside className="chapter-editor-side" aria-label="Контекст и AI-помощники">
                <ProjectAgentSettingsCard
                  agentKey="draft_fragment_editor"
                  className="chapter-editor-panel"
                  description="Применяется к локальным правкам выделения и черновика."
                  disabled={readOnly}
                  projectId={projectId}
                  title="Редактор фрагмента"
                />

                <section className="chapter-editor-panel">
                  <div className="chapter-editor-panel__title">
                    <Sparkles size={18} aria-hidden="true" />
                    <h2>AI-помощники</h2>
                  </div>
                  <div className="chapter-editor-assist-group">
                    <span>Выделение</span>
                    <div>
                      {selectionActions.map((action) => (
                        <button
                          disabled={!canUseSelectionAssist || assistMutation.isPending}
                          key={action.key}
                          onClick={() => runAssistant(action)}
                          type="button"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="chapter-editor-assist-group">
                    <span>Вся глава</span>
                    <div>
                      {documentActions.map((action) => (
                        <button
                          disabled={!canUseDocumentAssist || assistMutation.isPending}
                          key={action.key}
                          onClick={() => runAssistant(action)}
                          type="button"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {selection && (
                    <p className="chapter-editor-selection">
                      {selection.isEmpty
                        ? "Выделите фрагмент для локальной правки."
                        : `${selection.to - selection.from} символов выделено.`}
                    </p>
                  )}
                </section>

                {suggestion && (
                  <section className="chapter-editor-panel chapter-editor-suggestion">
                    <div className="chapter-editor-panel__title">
                      <Bot size={18} aria-hidden="true" />
                      <h2>Preview правки</h2>
                    </div>
                    <label>
                      <span>Было</span>
                      <textarea readOnly rows={5} value={suggestion.originalMarkdown} />
                    </label>
                    <label>
                      <span>Будет</span>
                      <textarea
                        disabled={readOnly}
                        onChange={(event) =>
                          setSuggestion({ ...suggestion, replacementMarkdown: event.target.value })
                        }
                        rows={7}
                        value={suggestion.replacementMarkdown}
                      />
                    </label>
                    {suggestion.rationale && <p>{suggestion.rationale}</p>}
                    {suggestion.warnings.map((warning) => (
                      <NoticeBlock key={warning}>{warning}</NoticeBlock>
                    ))}
                    <div className="chapter-editor-suggestion__actions">
                      <button disabled={readOnly} onClick={acceptSuggestion} type="button">
                        <Check size={15} aria-hidden="true" />
                        Принять
                      </button>
                      <button onClick={rejectSuggestion} type="button">
                        <X size={15} aria-hidden="true" />
                        Отклонить
                      </button>
                    </div>
                  </section>
                )}

                <section className="chapter-editor-panel">
                  <h2>Ключевые события</h2>
                  <div className="chapter-editor-events">
                    {(sessionQuery.data?.key_events || []).map((event) => {
                      const inText = includesEvent(markdown, event.title, event.summary);
                      return (
                        <div key={event.id}>
                          <strong>{event.title}</strong>
                          <span>
                            {!event.include_in_draft ? "исключено" : inText ? "видно в тексте" : "не видно явно"}
                          </span>
                          {event.summary && <p>{event.summary}</p>}
                        </div>
                      );
                    })}
                    {!sessionQuery.data?.key_events.length && <span>ключевых событий нет</span>}
                  </div>
                </section>

                <section className="chapter-editor-panel">
                  <h2>Память и линии</h2>
                  <div className="chapter-editor-context-list">
                    {(memoryQuery.data || []).slice(0, 6).map((item) => (
                      <div key={item.id}>
                        <strong>{item.title}</strong>
                        <span>{memoryTypeLabel(item.type)}</span>
                      </div>
                    ))}
                    {(storyLinesQuery.data || []).slice(0, 6).map((line) => (
                      <div key={line.id}>
                        <strong>{line.title}</strong>
                        <span>{line.current_state || line.description || line.type}</span>
                      </div>
                    ))}
                    {!memoryQuery.data?.length && !storyLinesQuery.data?.length && (
                      <span>контекст появится после памяти и линий</span>
                    )}
                  </div>
                </section>
              </aside>
            </main>
          </>
        )}

        {blocker.state === "blocked" && (
          <div className="chapter-editor-blocker" role="dialog" aria-label="Несохраненные правки">
            <div>
              <strong>Есть несохраненные правки</strong>
              <span>Сохраните markdown или подтвердите выход без сохранения.</span>
            </div>
            <button onClick={() => blocker.reset()} type="button">
              Остаться
            </button>
            <button onClick={() => blocker.proceed()} type="button">
              Выйти без сохранения
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
