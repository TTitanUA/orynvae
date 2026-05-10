import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, ChevronLeft, GitBranch, HelpCircle, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  chapterReviewMutations,
  chapterReviewLineStatusLabel,
  chapterReviewNoteStatusLabel,
  chapterReviewNoteTypeLabel,
  chapterReviewQueries,
  chapterReviewQueryKeys,
  chapterReviewStatusLabel,
  type ChapterReviewApplyPayload,
  type ChapterReviewDecisionStatus,
  type ChapterReviewLineUpdateStatus,
  type ChapterReviewNoteStatus,
} from "../../../entities/chapter-review";
import {
  memoryQueries,
  memoryQueryKeys,
  memoryTypeLabel,
  type MemoryItemStatus,
} from "../../../entities/memory";
import { ProjectAgentSettingsCard } from "../../../entities/project-ai-settings";
import { storyLineQueries, type StoryLineStatus } from "../../../entities/story-line";
import { NoticeBlock, StatusPill } from "../../../shared/ui";
import { AppShell } from "../../../widgets/app-shell";
import "./ChapterReviewRoute.css";

type ChapterReviewRouteProps = {
  projectId: string;
  chapterId: string;
};

type MemoryDecisionState = Record<string, { status: ChapterReviewDecisionStatus; targetStatus: MemoryItemStatus }>;
type LineDecisionState = Record<string, { status: Exclude<ChapterReviewLineUpdateStatus, "pending">; targetId: string; targetStatus: StoryLineStatus | "" }>;
type NoteDecisionState = Record<string, { status: Exclude<ChapterReviewNoteStatus, "pending">; decisionNote: string }>;

function chapterReviewDecisionStatusLabel(status: ChapterReviewDecisionStatus | string): string {
  switch (status) {
    case "accepted":
      return "принято";
    case "deferred":
      return "отложено";
    case "rejected":
      return "отклонено";
    default:
      return "ожидает";
  }
}

export function ChapterReviewRoute({ projectId, chapterId }: ChapterReviewRouteProps) {
  const queryClient = useQueryClient();
  const [memoryDecisions, setMemoryDecisions] = useState<MemoryDecisionState>({});
  const [lineDecisions, setLineDecisions] = useState<LineDecisionState>({});
  const [noteDecisions, setNoteDecisions] = useState<NoteDecisionState>({});

  const summaryQuery = useQuery(memoryQueries.workspaceSummary(projectId));
  const reviewQuery = useQuery(chapterReviewQueries.detail(projectId, chapterId));
  const storyLinesQuery = useQuery(storyLineQueries.list(projectId));
  const review = reviewQuery.data;
  const readOnly = Boolean(summaryQuery.data?.runtime.read_only);
  const reviewMissing = reviewQuery.error instanceof Error && /not found/i.test(reviewQuery.error.message);
  const errors = [summaryQuery.error, storyLinesQuery.error, reviewMissing ? null : reviewQuery.error]
    .filter((error): error is Error => error instanceof Error)
    .map((error) => error.message);
  const pendingCount = useMemo(() => {
    if (!review) {
      return 0;
    }
    return [
      ...review.memory_proposals.filter((item) => item.status === "pending"),
      ...review.story_line_updates.filter((item) => item.status === "pending"),
      ...review.notes.filter((item) => item.status === "pending"),
    ].length;
  }, [review]);

  function invalidateAll() {
    void queryClient.invalidateQueries({ queryKey: chapterReviewQueryKeys.detail(projectId, chapterId) });
    void queryClient.invalidateQueries({ queryKey: memoryQueryKeys.all });
  }

  const generateMutation = useMutation({
    ...chapterReviewMutations.generate(projectId, chapterId),
    onSuccess: (response) => {
      queryClient.setQueryData(chapterReviewQueryKeys.detail(projectId, chapterId), response);
      invalidateAll();
    },
  });
  const applyMutation = useMutation({
    ...chapterReviewMutations.apply(projectId, chapterId),
    onSuccess: (response) => {
      queryClient.setQueryData(chapterReviewQueryKeys.detail(projectId, chapterId), response);
      setMemoryDecisions({});
      setLineDecisions({});
      setNoteDecisions({});
      invalidateAll();
    },
  });

  const storyLines = storyLinesQuery.data || [];
  const hasDecisionChanges =
    Object.keys(memoryDecisions).length + Object.keys(lineDecisions).length + Object.keys(noteDecisions).length > 0;
  const forecastHref = `/projects/${projectId}/chapters/${chapterId}/forecast`;
  const editorHref = `/projects/${projectId}/chapters/${chapterId}/editor`;

  function applyDecisions() {
    if (!review || !hasDecisionChanges || readOnly) {
      return;
    }
    const payload: ChapterReviewApplyPayload = {
      review_id: review.review.id,
      memory_decisions: Object.entries(memoryDecisions).map(([proposalId, decision]) => ({
        proposal_id: proposalId,
        status: decision.status,
        target_status: decision.targetStatus,
      })),
      story_line_decisions: Object.entries(lineDecisions).map(([updateId, decision]) => ({
        update_id: updateId,
        status: decision.status,
        target_story_line_id: decision.targetId || null,
        target_status: decision.targetStatus || null,
      })),
      note_decisions: Object.entries(noteDecisions).map(([noteId, decision]) => ({
        note_id: noteId,
        status: decision.status,
        decision_note: decision.decisionNote.trim() || null,
      })),
    };
    applyMutation.mutate(payload);
  }

  return (
    <AppShell>
      <div className="review-route">
        <header className="review-header">
          <div>
            <Link className="review-back" to={`/projects/${projectId}`}>
              <ChevronLeft size={16} aria-hidden="true" />
              Workspace
            </Link>
            <h1>{review?.chapter.title || "Разбор после главы"}</h1>
            <p>{review?.project.title || summaryQuery.data?.project.title || "История"}</p>
          </div>
          <div className="review-header__status">
            <StatusPill label={readOnly ? "Только чтение" : "AI доступен"} tone={readOnly ? "warning" : "ready"} />
            <span>{review ? chapterReviewStatusLabel(review.review.status) : "разбор не создан"}</span>
          </div>
        </header>

        {errors.map((error) => (
          <NoticeBlock key={error} tone="error">
            {error}
          </NoticeBlock>
        ))}
        {readOnly && <NoticeBlock>Разбор доступен только для чтения, пока AI недоступен.</NoticeBlock>}
        {generateMutation.error instanceof Error && <NoticeBlock tone="error">{generateMutation.error.message}</NoticeBlock>}
        {applyMutation.error instanceof Error && <NoticeBlock tone="error">{applyMutation.error.message}</NoticeBlock>}

        <ProjectAgentSettingsCard
          agentKey="chapter_reviewer"
          className="review-panel"
          description="Применяется к разбору главы, извлечению памяти и обновлениям линий после сессии."
          disabled={readOnly}
          projectId={projectId}
          title="Настройки разбора"
        />

        {!review && (
          <section className="review-panel review-empty">
            <Sparkles size={24} aria-hidden="true" />
            <h2>Разбор еще не создан</h2>
            <button disabled={readOnly || generateMutation.isPending} onClick={() => generateMutation.mutate({})} type="button">
              Сгенерировать разбор
            </button>
          </section>
        )}

        {review && (
          <>
            <section className="review-summary review-panel">
              <div>
                <h2>Что изменилось</h2>
                <p>{review.review.summary}</p>
              </div>
              <div className="review-summary__actions">
                <span>{pendingCount} ожидает решения</span>
                <button disabled={readOnly || !hasDecisionChanges || applyMutation.isPending} onClick={applyDecisions} type="button">
                  <Check size={15} aria-hidden="true" />
                  Применить решения
                </button>
                <Link to={editorHref}>Редактор</Link>
                <Link to={forecastHref}>К прогнозу</Link>
              </div>
            </section>

            <div className="review-layout">
              <main className="review-column">
                <section className="review-panel">
                  <h2>Память</h2>
                  {review.memory_proposals.map((proposal) => (
                    <article className="review-card" key={proposal.id}>
                      <div>
                        <strong>{String(proposal.suggested_payload.title || proposal.proposal_type)}</strong>
                        <span>
                          {memoryTypeLabel(String(proposal.suggested_payload.type || "note"))} · {chapterReviewDecisionStatusLabel(proposal.status)}
                        </span>
                      </div>
                      {proposal.reason && <p>{proposal.reason}</p>}
                      <div className="review-actions">
                        <button
                          aria-pressed={memoryDecisions[proposal.id]?.status === "accepted"}
                          disabled={readOnly || proposal.status !== "pending"}
                          onClick={() =>
                            setMemoryDecisions((current) => ({
                              ...current,
                              [proposal.id]: { status: "accepted", targetStatus: "canon" },
                            }))
                          }
                          type="button"
                        >
                          Канон
                        </button>
                        <button
                          aria-pressed={memoryDecisions[proposal.id]?.status === "deferred"}
                          disabled={readOnly || proposal.status !== "pending"}
                          onClick={() =>
                            setMemoryDecisions((current) => ({
                              ...current,
                              [proposal.id]: { status: "deferred", targetStatus: "draft" },
                            }))
                          }
                          type="button"
                        >
                          Отложить
                        </button>
                        <button
                          aria-pressed={memoryDecisions[proposal.id]?.status === "rejected"}
                          disabled={readOnly || proposal.status !== "pending"}
                          onClick={() =>
                            setMemoryDecisions((current) => ({
                              ...current,
                              [proposal.id]: { status: "rejected", targetStatus: "draft" },
                            }))
                          }
                          type="button"
                        >
                          Отклонить
                        </button>
                      </div>
                    </article>
                  ))}
                  {review.memory_proposals.length === 0 && <span className="review-empty-line">нет предложений памяти</span>}
                </section>

                <section className="review-panel">
                  <h2>Линии истории</h2>
                  {review.story_line_updates.map((update) => {
                    const decision = lineDecisions[update.id];
                    const selectedTargetId = decision?.targetId ?? update.target_story_line_id ?? "";
                    const canAcceptLineUpdate = Boolean(
                      !readOnly && update.status === "pending" && selectedTargetId,
                    );
                    return (
                      <article className="review-card" key={update.id}>
                        <div>
                          <strong>{update.title}</strong>
                          <span>{chapterReviewLineStatusLabel(update.status)}</span>
                        </div>
                        <p>{update.after_state}</p>
                        <select
                          aria-label="Целевая линия истории"
                          disabled={readOnly || update.status !== "pending"}
                          name={`review-line-target-${update.id}`}
                          onChange={(event) =>
                            setLineDecisions((current) => ({
                              ...current,
                              [update.id]: {
                                status: decision?.status || "accepted",
                                targetId: event.target.value,
                                targetStatus: decision?.targetStatus || "",
                              },
                            }))
                          }
                          value={selectedTargetId}
                        >
                          <option value="">Выбрать линию</option>
                          {storyLines.map((line) => (
                            <option key={line.id} value={line.id}>
                              {line.title}
                            </option>
                          ))}
                        </select>
                        <div className="review-actions">
                          <button
                            aria-pressed={decision?.status === "accepted"}
                            disabled={!canAcceptLineUpdate}
                            onClick={() =>
                              setLineDecisions((current) => ({
                                ...current,
                                [update.id]: {
                                  status: "accepted",
                                  targetId: selectedTargetId,
                                  targetStatus: "active",
                                },
                              }))
                            }
                            type="button"
                          >
                            Принять
                          </button>
                          <button
                            aria-pressed={decision?.status === "deferred"}
                            disabled={readOnly || update.status !== "pending"}
                            onClick={() =>
                              setLineDecisions((current) => ({
                                ...current,
                                [update.id]: {
                                  status: "deferred",
                                  targetId: decision?.targetId || update.target_story_line_id || "",
                                  targetStatus: "",
                                },
                              }))
                            }
                            type="button"
                          >
                            Отложить
                          </button>
                          <button
                            aria-pressed={decision?.status === "rejected"}
                            disabled={readOnly || update.status !== "pending"}
                            onClick={() =>
                              setLineDecisions((current) => ({
                                ...current,
                                [update.id]: {
                                  status: "rejected",
                                  targetId: decision?.targetId || update.target_story_line_id || "",
                                  targetStatus: "",
                                },
                              }))
                            }
                            type="button"
                          >
                            Отклонить
                          </button>
                        </div>
                      </article>
                    );
                  })}
                  {review.story_line_updates.length === 0 && <span className="review-empty-line">нет обновлений линий</span>}
                </section>
              </main>

              <aside className="review-column">
                <section className="review-panel">
                  <h2>Вопросы и противоречия</h2>
                  {review.notes.map((note) => {
                    const decision = noteDecisions[note.id];
                    return (
                      <article className="review-card" key={note.id}>
                        <div>
                          {note.note_type === "contradiction" ? (
                            <AlertTriangle size={16} aria-hidden="true" />
                          ) : (
                            <HelpCircle size={16} aria-hidden="true" />
                          )}
                          <strong>{note.title}</strong>
                          <span>{chapterReviewNoteTypeLabel(note.note_type)} · {chapterReviewNoteStatusLabel(note.status)}</span>
                        </div>
                        {typeof note.body.description === "string" && <p>{note.body.description}</p>}
                        {typeof note.body.why === "string" && <p>{note.body.why}</p>}
                        <textarea
                          aria-label="Заметка решения"
                          disabled={readOnly || note.status !== "pending"}
                          name={`review-note-decision-${note.id}`}
                          onChange={(event) =>
                            setNoteDecisions((current) => ({
                              ...current,
                              [note.id]: {
                                status: decision?.status || "resolved",
                                decisionNote: event.target.value,
                              },
                            }))
                          }
                          placeholder="Заметка решения"
                          rows={3}
                          value={decision?.decisionNote || ""}
                        />
                        <div className="review-actions">
                          <button
                            aria-pressed={decision?.status === "resolved"}
                            disabled={readOnly || note.status !== "pending"}
                            onClick={() =>
                              setNoteDecisions((current) => ({
                                ...current,
                                [note.id]: { status: "resolved", decisionNote: decision?.decisionNote || "" },
                              }))
                            }
                            type="button"
                          >
                            Решено
                          </button>
                          <button
                            aria-pressed={decision?.status === "deferred"}
                            disabled={readOnly || note.status !== "pending"}
                            onClick={() =>
                              setNoteDecisions((current) => ({
                                ...current,
                                [note.id]: { status: "deferred", decisionNote: decision?.decisionNote || "" },
                              }))
                            }
                            type="button"
                          >
                            Отложить
                          </button>
                          <button
                            aria-pressed={decision?.status === "rejected"}
                            disabled={readOnly || note.status !== "pending"}
                            onClick={() =>
                              setNoteDecisions((current) => ({
                                ...current,
                                [note.id]: { status: "rejected", decisionNote: decision?.decisionNote || "" },
                              }))
                            }
                            type="button"
                          >
                            Отклонить
                          </button>
                        </div>
                      </article>
                    );
                  })}
                  {review.notes.length === 0 && <span className="review-empty-line">нет вопросов и противоречий</span>}
                </section>

                <section className="review-panel">
                  <div className="review-panel__title">
                    <GitBranch size={18} aria-hidden="true" />
                    <h2>Переход</h2>
                  </div>
                  <p>После решений можно построить прогноз: он сохранит мягкие направления без фиксации финала.</p>
                  <Link to={forecastHref}>Открыть прогноз</Link>
                </section>
              </aside>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
