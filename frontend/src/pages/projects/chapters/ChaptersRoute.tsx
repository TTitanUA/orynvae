import { useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronLeft, FileText, Play, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import {
  chapterQueries,
  chapterStatusLabel,
  type Chapter,
} from "../../../entities/chapter";
import { memoryQueries } from "../../../entities/memory";
import { NoticeBlock, StatusPill } from "../../../shared/ui";
import { AppShell } from "../../../widgets/app-shell";
import "./ChaptersRoute.css";

type ChaptersRouteProps = {
  projectId: string;
};

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "нет даты";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function hasChapterText(chapter: Chapter): boolean {
  return Boolean(chapter.final_markdown.trim() || chapter.draft_markdown.trim());
}

function chapterPreview(chapter: Chapter): string {
  const markdown = chapter.final_markdown.trim() || chapter.draft_markdown.trim();
  const source = markdown || chapter.synopsis?.trim() || "";
  if (!source) {
    return "Текст появится после сборки черновика.";
  }
  return source.length > 360 ? `${source.slice(0, 360).trimEnd()}...` : source;
}

function sortChapters(chapters: Chapter[]): Chapter[] {
  return [...chapters].sort((left, right) => {
    if (left.order_index !== right.order_index) {
      return left.order_index - right.order_index;
    }
    return left.created_at.localeCompare(right.created_at);
  });
}

export function ChaptersRoute({ projectId }: ChaptersRouteProps) {
  const summaryQuery = useQuery(memoryQueries.workspaceSummary(projectId));
  const chaptersQuery = useQuery(chapterQueries.list(projectId));
  const chapters = sortChapters(chaptersQuery.data || []);
  const readOnly = Boolean(summaryQuery.data?.runtime.read_only);
  const readyCount = chapters.filter(hasChapterText).length;
  const errors = [summaryQuery.error, chaptersQuery.error]
    .filter((error): error is Error => error instanceof Error)
    .map((error) => error.message);

  return (
    <AppShell>
      <div className="chapters-route">
        <header className="chapters-header">
          <div>
            <Link className="chapters-back" to={`/projects/${projectId}`}>
              <ChevronLeft size={16} aria-hidden="true" />
              Проект
            </Link>
            <h1>Главы</h1>
            <p>{summaryQuery.data?.project.title || "Текущий проект"}</p>
          </div>
          <div className="chapters-header__status">
            <StatusPill label={readOnly ? "Только чтение" : "AI доступен"} tone={readOnly ? "warning" : "ready"} />
            <span>
              {readyCount} готово из {chapters.length}
            </span>
          </div>
        </header>

        {chaptersQuery.isPending && <NoticeBlock>Загрузка глав</NoticeBlock>}
        {errors.map((error) => (
          <NoticeBlock key={error} tone="error">
            {error}
          </NoticeBlock>
        ))}
        {summaryQuery.data?.warnings.map((warning) => <NoticeBlock key={warning}>{warning}</NoticeBlock>)}

        <section className="chapters-toolbar" aria-label="Действия с главами">
          <div>
            <BookOpen size={18} aria-hidden="true" />
            <span>Список сохраненных глав и черновиков</span>
          </div>
          <Link className="chapters-primary-link" to={`/projects/${projectId}/chapters/prepare`}>
            <Sparkles size={15} aria-hidden="true" />
            Подготовить главу
          </Link>
        </section>

        <main className="chapters-list" aria-label="Список глав">
          {chapters.map((chapter) => (
            <ChapterCard chapter={chapter} key={chapter.id} projectId={projectId} />
          ))}
          {!chaptersQuery.isPending && chapters.length === 0 && (
            <NoticeBlock>Глав пока нет. Можно начать с подготовки первой главы.</NoticeBlock>
          )}
        </main>
      </div>
    </AppShell>
  );
}

function ChapterCard({ chapter, projectId }: { chapter: Chapter; projectId: string }) {
  const ready = hasChapterText(chapter);
  const draftHref = chapter.session_id
    ? `/projects/${projectId}/sessions/${chapter.session_id}/draft`
    : null;
  const sessionHref = chapter.session_id
    ? `/projects/${projectId}/sessions/${chapter.session_id}/narrator`
    : null;
  const reviewHref = `/projects/${projectId}/chapters/${chapter.id}/review`;
  const prepareHref = `/projects/${projectId}/chapters/${chapter.id}/prepare`;

  return (
    <article className="chapter-card">
      <div className="chapter-card__header">
        <div>
          <span>Глава {chapter.order_index}</span>
          <h2>{chapter.title}</h2>
        </div>
        <StatusPill label={ready ? "Текст есть" : chapterStatusLabel(chapter.status)} tone={ready ? "ready" : "neutral"} />
      </div>

      <p className="chapter-card__preview">{chapterPreview(chapter)}</p>

      <dl className="chapter-card__facts">
        <div>
          <dt>Статус</dt>
          <dd>{chapterStatusLabel(chapter.status)}</dd>
        </div>
        <div>
          <dt>Обновлена</dt>
          <dd>{formatTimestamp(chapter.updated_at)}</dd>
        </div>
        <div>
          <dt>Сессия</dt>
          <dd>{chapter.session_id ? "есть" : "нет"}</dd>
        </div>
      </dl>

      <div className="chapter-card__actions">
        {draftHref && ready && (
          <Link to={draftHref}>
            <FileText size={15} aria-hidden="true" />
            Читать черновик
          </Link>
        )}
        {sessionHref && (
          <Link to={sessionHref}>
            <Play size={15} aria-hidden="true" />
            Открыть сессию
          </Link>
        )}
        {ready && <Link to={reviewHref}>Разбор</Link>}
        <Link to={prepareHref}>Подготовка</Link>
      </div>
    </article>
  );
}
