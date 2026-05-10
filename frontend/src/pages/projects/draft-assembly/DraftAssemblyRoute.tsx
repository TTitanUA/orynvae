import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, ChevronLeft, Eye, ListChecks, Save, Sparkles, WandSparkles } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Link } from "react-router-dom";

import {
  draftModeOptions,
  draftMutations,
  draftQueries,
  draftQueryKeys,
  type DraftMode,
} from "../../../entities/draft";
import { memoryQueries, memoryQueryKeys } from "../../../entities/memory";
import {
  actorLabel,
  narratorSessionQueries,
  narratorSessionQueryKeys,
  type KeyEvent,
  type NarratorSessionDetail,
} from "../../../entities/narrator-session";
import { ProjectAgentSettingsCard } from "../../../entities/project-ai-settings";
import { NoticeBlock, StatusPill } from "../../../shared/ui";
import { AppShell } from "../../../widgets/app-shell";
import "./DraftAssemblyRoute.css";

type DraftAssemblyRouteProps = {
  projectId: string;
  sessionId: string;
};

export function DraftAssemblyRoute({ projectId, sessionId }: DraftAssemblyRouteProps) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<DraftMode>("literary");
  const [styleNotes, setStyleNotes] = useState("");
  const [requiredEventIdsOverride, setRequiredEventIdsOverride] = useState<string[] | null>(null);
  const [excludedTurnIdsOverride, setExcludedTurnIdsOverride] = useState<string[] | null>(null);
  const [markdownDraft, setMarkdownDraft] = useState("");
  const [markdownDirty, setMarkdownDirty] = useState(false);
  const [selectionMarkdown, setSelectionMarkdown] = useState("");
  const [assistInstructions, setAssistInstructions] = useState("");
  const [assistPreview, setAssistPreview] = useState("");

  const summaryQuery = useQuery(memoryQueries.workspaceSummary(projectId));
  const detailQuery = useQuery(narratorSessionQueries.detail(sessionId));
  const detail = detailQuery.data;
  const chapterId = detail?.chapter?.id || null;
  const versionsQuery = useQuery(draftQueries.versions(projectId, chapterId));
  const latestDraft = versionsQuery.data?.[0] || null;
  const readOnly = Boolean(summaryQuery.data?.runtime.read_only);
  const turns = useMemo(() => detail?.turns || [], [detail?.turns]);
  const keyEvents = useMemo(() => detail?.key_events || [], [detail?.key_events]);
  const defaultRequiredEventIds = useMemo(
    () => keyEvents.filter((event) => event.include_in_draft).map((event) => event.id),
    [keyEvents],
  );
  const defaultExcludedTurnIds = useMemo(
    () => turns.filter((turn) => turn.exclude_from_draft).map((turn) => turn.id),
    [turns],
  );
  const requiredEventIds = requiredEventIdsOverride ?? defaultRequiredEventIds;
  const excludedTurnIds = excludedTurnIdsOverride ?? defaultExcludedTurnIds;
  const markdown = markdownDirty
    ? markdownDraft
    : markdownDraft || latestDraft?.markdown || detail?.chapter?.draft_markdown || "";
  const warnings = [
    ...(detail?.warnings || []),
    ...(summaryQuery.data?.warnings || []),
  ];
  const busy = summaryQuery.isPending || detailQuery.isPending || versionsQuery.isPending;
  const errors = [summaryQuery.error, detailQuery.error, versionsQuery.error]
    .filter((error): error is Error => error instanceof Error)
    .map((error) => error.message);

  function invalidateAll() {
    void queryClient.invalidateQueries({ queryKey: memoryQueryKeys.workspaceSummary(projectId) });
    if (chapterId) {
      void queryClient.invalidateQueries({ queryKey: draftQueryKeys.versions(projectId, chapterId) });
    }
  }

  const assembleMutation = useMutation({
    ...draftMutations.assemble(sessionId),
    onSuccess: (response) => {
      setMarkdownDraft(response.draft_version.markdown);
      setMarkdownDirty(true);
      setMode(response.draft_version.mode);
      queryClient.setQueryData<NarratorSessionDetail>(
        narratorSessionQueryKeys.detail(sessionId),
        (current) =>
          current
            ? { ...current, chapter: response.chapter, session: response.session, warnings: response.warnings }
            : current,
      );
      invalidateAll();
    },
  });
  const updateMutation = useMutation({
    ...draftMutations.update(projectId, chapterId || ""),
    onSuccess: (response) => {
      setMarkdownDraft(response.draft_version.markdown);
      setMarkdownDirty(true);
      invalidateAll();
    },
  });
  const assistMutation = useMutation({
    ...draftMutations.assist(projectId, chapterId || ""),
    onSuccess: (response) => setAssistPreview(response.replacement_markdown),
  });

  const canGenerate = Boolean(!readOnly && chapterId);
  const canMutate = Boolean(!readOnly && chapterId);
  const canAssemble = Boolean(canGenerate && detail?.session.status && ["completed", "draft_ready"].includes(detail.session.status));
  const reviewHref = detail?.chapter?.id
    ? `/projects/${projectId}/chapters/${detail.chapter.id}/review`
    : `/projects/${projectId}`;
  const editorHref = detail?.chapter?.id
    ? `/projects/${projectId}/chapters/${detail.chapter.id}/editor`
    : `/projects/${projectId}`;

  function submitAssembly(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAssemble || assembleMutation.isPending) {
      return;
    }
    assembleMutation.mutate({
      mode,
      required_event_ids: requiredEventIds,
      excluded_turn_ids: excludedTurnIds,
      style_notes: styleNotes.trim() || null,
    });
  }

  function saveDraft() {
    if (!canMutate || !chapterId || !markdown.trim()) {
      return;
    }
    updateMutation.mutate({ markdown, mode, status: "edited" });
  }

  function requestAssist() {
    if (!canGenerate || !chapterId || !selectionMarkdown.trim() || !assistInstructions.trim()) {
      return;
    }
    assistMutation.mutate({
      selection_markdown: selectionMarkdown,
      instructions: assistInstructions,
    });
  }

  function applyAssistPreview() {
    const replacement = assistPreview.trim();
    if (!replacement) {
      return;
    }
    const selected = selectionMarkdown.trim();
    const currentMarkdown = markdown;
    setMarkdownDirty(true);
    setMarkdownDraft(
      selected && currentMarkdown.includes(selected)
        ? currentMarkdown.replace(selected, replacement)
        : [currentMarkdown.trimEnd(), replacement].filter(Boolean).join("\n\n"),
    );
    setAssistPreview("");
  }

  return (
    <AppShell>
      <div className="draft-route">
        <header className="draft-header">
          <div>
            <Link className="draft-back" to={`/projects/${projectId}/sessions/${sessionId}/narrator?tab=log`}>
              <ChevronLeft size={16} aria-hidden="true" />
              Лог сессии
            </Link>
            <h1>{detail?.chapter?.title || "Сборка черновика"}</h1>
            <p>{detail?.project.title || summaryQuery.data?.project.title || "История"}</p>
          </div>
          <div className="draft-header__status">
            <StatusPill label={readOnly ? "Только чтение" : "AI доступен"} tone={readOnly ? "warning" : "ready"} />
            <span>{latestDraft ? "есть версия черновика" : "черновик не собран"}</span>
          </div>
        </header>

        {busy && <NoticeBlock>Загрузка сборки черновика</NoticeBlock>}
        {errors.map((error) => (
          <NoticeBlock key={error} tone="error">
            {error}
          </NoticeBlock>
        ))}
        {warnings.map((warning) => (
          <NoticeBlock key={warning}>{warning}</NoticeBlock>
        ))}
        {readOnly && <NoticeBlock>Черновик доступен только для чтения, пока AI недоступен.</NoticeBlock>}
        {assembleMutation.error instanceof Error && <NoticeBlock tone="error">{assembleMutation.error.message}</NoticeBlock>}
        {updateMutation.error instanceof Error && <NoticeBlock tone="error">{updateMutation.error.message}</NoticeBlock>}
        {assistMutation.error instanceof Error && <NoticeBlock tone="error">{assistMutation.error.message}</NoticeBlock>}

        {detail && (
          <div className="draft-layout">
            <aside className="draft-source">
              <section className="draft-panel">
                <div className="draft-panel__title">
                  <ListChecks size={18} aria-hidden="true" />
                  <h2>Материал сессии</h2>
                </div>
                <EventChecklist
                  events={keyEvents}
                  onChange={setRequiredEventIdsOverride}
                  readOnly={readOnly}
                  selectedIds={requiredEventIds}
                />
              </section>

              <section className="draft-panel">
                <div className="draft-panel__title">
                  <BookOpen size={18} aria-hidden="true" />
                  <h2>Ходы</h2>
                </div>
                <div className="draft-turns">
                  {turns.map((turn) => (
                    <label key={turn.id}>
                      <input
                        checked={!excludedTurnIds.includes(turn.id)}
                        disabled={readOnly}
                        name="draft-included-turns"
                        onChange={(event) =>
                          setExcludedTurnIdsOverride((current) => {
                            const ids = current ?? defaultExcludedTurnIds;
                            return event.target.checked
                              ? ids.filter((id) => id !== turn.id)
                              : [...ids, turn.id];
                          })
                        }
                        type="checkbox"
                        value={turn.id}
                      />
                      <span className="draft-item__body">
                        <span className="draft-item__meta">{actorLabel(turn.actor_type)}</span>
                        <strong>{turn.content}</strong>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            </aside>

            <main className="draft-workspace">
              <ProjectAgentSettingsCard
                agentKey="draft_assembler"
                className="draft-panel"
                description="Применяется к сборке литературного markdown из материала сессии."
                disabled={readOnly}
                projectId={projectId}
                title="Настройки сборки"
              />

              <form className="draft-panel draft-controls" onSubmit={submitAssembly}>
                <div className="draft-panel__title">
                  <WandSparkles size={18} aria-hidden="true" />
                  <h2>Сборка</h2>
                </div>
                <select
                  aria-label="Режим черновика"
                  disabled={readOnly || assembleMutation.isPending}
                  name="draft-mode"
                  onChange={(event) => setMode(event.target.value as DraftMode)}
                  value={mode}
                >
                  {draftModeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <textarea
                  aria-label="Стилевые ограничения"
                  disabled={readOnly || assembleMutation.isPending}
                  name="draft-style-notes"
                  onChange={(event) => setStyleNotes(event.target.value)}
                  placeholder="Стилевые ограничения"
                  rows={3}
                  value={styleNotes}
                />
                <button disabled={!canAssemble || assembleMutation.isPending} type="submit">
                  <Sparkles size={15} aria-hidden="true" />
                  {latestDraft ? "Пересобрать" : "Собрать черновик"}
                </button>
              </form>

              <section className="draft-editor-grid">
                <label className="draft-markdown">
                  <span>Markdown</span>
                  <textarea
                    disabled={readOnly || updateMutation.isPending}
                    name="draft-markdown"
                    onChange={(event) => {
                      setMarkdownDirty(true);
                      setMarkdownDraft(event.target.value);
                    }}
                    rows={22}
                    value={markdown}
                  />
                </label>
                <div className="draft-preview">
                  <div className="draft-panel__title">
                    <Eye size={18} aria-hidden="true" />
                    <h2>Preview</h2>
                  </div>
                  <ReactMarkdown>{markdown || "Черновик появится после сборки."}</ReactMarkdown>
                </div>
              </section>

              <ProjectAgentSettingsCard
                agentKey="draft_fragment_editor"
                className="draft-panel"
                description="Применяется к AI-правке выбранного markdown-фрагмента."
                disabled={readOnly}
                projectId={projectId}
                title="Настройки правки"
              />

              <section className="draft-panel draft-assist">
                <div className="draft-panel__title">
                  <Sparkles size={18} aria-hidden="true" />
                  <h2>AI правка фрагмента</h2>
                </div>
                <textarea
                  aria-label="Фрагмент markdown"
                  disabled={readOnly || assistMutation.isPending}
                  name="draft-selection-markdown"
                  onChange={(event) => setSelectionMarkdown(event.target.value)}
                  placeholder="Фрагмент markdown"
                  rows={4}
                  value={selectionMarkdown}
                />
                <textarea
                  aria-label="Инструкция для AI правки"
                  disabled={readOnly || assistMutation.isPending}
                  name="draft-assist-instructions"
                  onChange={(event) => setAssistInstructions(event.target.value)}
                  placeholder="Что сделать с фрагментом"
                  rows={3}
                  value={assistInstructions}
                />
                <div className="draft-actions-row">
                  <button
                    disabled={!canGenerate || assistMutation.isPending || !selectionMarkdown.trim() || !assistInstructions.trim()}
                    onClick={requestAssist}
                    type="button"
                  >
                    Предложить правку
                  </button>
                  <button disabled={!canMutate || !markdown.trim()} onClick={saveDraft} type="button">
                    <Save size={15} aria-hidden="true" />
                    Сохранить markdown
                  </button>
                  <Link className="draft-next-link" to={editorHref}>
                    Редактор
                  </Link>
                  <Link className="draft-next-link" to={reviewHref}>
                    К разбору
                  </Link>
                </div>
                {assistPreview && (
                  <div className="draft-assist-preview">
                    <strong>Preview правки</strong>
                    <pre>{assistPreview}</pre>
                    <button disabled={readOnly} onClick={applyAssistPreview} type="button">
                      Применить к markdown
                    </button>
                  </div>
                )}
              </section>
            </main>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function EventChecklist({
  events,
  onChange,
  readOnly,
  selectedIds,
}: {
  events: KeyEvent[];
  onChange: (ids: string[]) => void;
  readOnly: boolean;
  selectedIds: string[];
}) {
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  if (events.length === 0) {
    return <span className="draft-empty">ключевых событий пока нет</span>;
  }
  return (
    <div className="draft-events">
      {events.map((event) => (
        <label key={event.id}>
          <input
            checked={selected.has(event.id)}
            disabled={readOnly}
            name="draft-required-events"
            onChange={(change) =>
              onChange(
                change.target.checked
                  ? [...selectedIds, event.id]
                  : selectedIds.filter((id) => id !== event.id),
              )
            }
            type="checkbox"
            value={event.id}
          />
          <span className="draft-item__body">
            <strong>{event.title}</strong>
            {event.summary && <span>{event.summary}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}
