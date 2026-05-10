import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Compass, GitBranch, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { forecastMutations, forecastQueries, forecastQueryKeys, type Forecast } from "../../../entities/forecast";
import { memoryQueries, memoryQueryKeys } from "../../../entities/memory";
import { ProjectAgentSettingsCard } from "../../../entities/project-ai-settings";
import { storyLineQueries } from "../../../entities/story-line";
import { NoticeBlock, StatusPill } from "../../../shared/ui";
import { AppShell } from "../../../widgets/app-shell";
import "./ForecastRoute.css";

type ForecastRouteProps = {
  projectId: string;
  chapterId: string;
};

export function ForecastRoute({ projectId, chapterId }: ForecastRouteProps) {
  const queryClient = useQueryClient();
  const [horizon, setHorizon] = useState(2);
  const [activeLineIds, setActiveLineIds] = useState<string[]>([]);
  const summaryQuery = useQuery(memoryQueries.workspaceSummary(projectId));
  const storyLinesQuery = useQuery(storyLineQueries.list(projectId));
  const forecastsQuery = useQuery(forecastQueries.list(projectId));
  const readOnly = Boolean(summaryQuery.data?.runtime.read_only);
  const storyLines = useMemo(() => storyLinesQuery.data || [], [storyLinesQuery.data]);
  const forecasts = forecastsQuery.data?.forecasts || [];
  const relevantForecasts = forecasts.filter((forecast) => forecast.source_chapter_id === chapterId);
  const latestForecast = relevantForecasts[0] || null;
  const selectedLineIds = activeLineIds.length
    ? activeLineIds
    : storyLines.filter((line) => ["active", "proposed", "sleeping"].includes(line.status)).map((line) => line.id).slice(0, 7);
  const lineTitleById = useMemo(
    () => new Map(storyLines.map((line) => [line.id, line.title])),
    [storyLines],
  );
  const errors = [summaryQuery.error, storyLinesQuery.error, forecastsQuery.error]
    .filter((error): error is Error => error instanceof Error)
    .map((error) => error.message);

  function invalidateAll() {
    void queryClient.invalidateQueries({ queryKey: forecastQueryKeys.list(projectId) });
    void queryClient.invalidateQueries({ queryKey: memoryQueryKeys.workspaceSummary(projectId) });
  }

  const generateMutation = useMutation({
    ...forecastMutations.generate(projectId),
    onSuccess: invalidateAll,
  });
  const selectMutation = useMutation({
    ...forecastMutations.selectOption(projectId, latestForecast?.id || ""),
    onSuccess: (forecast) => {
      queryClient.setQueryData(forecastQueryKeys.list(projectId), {
        forecasts: [forecast, ...forecasts.filter((item) => item.id !== forecast.id)],
      });
      invalidateAll();
    },
  });

  function generateForecast() {
    if (readOnly || generateMutation.isPending) {
      return;
    }
    generateMutation.mutate({
      source_chapter_id: chapterId,
      horizon_chapters: horizon,
      active_story_line_ids: selectedLineIds,
    });
  }

  function toggleLine(lineId: string) {
    setActiveLineIds((current) =>
      current.includes(lineId) ? current.filter((id) => id !== lineId) : [...current, lineId],
    );
  }

  return (
    <AppShell>
      <div className="forecast-route">
        <header className="forecast-header">
          <div>
            <Link className="forecast-back" to={`/projects/${projectId}/chapters/${chapterId}/review`}>
              <ChevronLeft size={16} aria-hidden="true" />
              Разбор
            </Link>
            <h1>Прогноз следующего движения</h1>
            <p>{summaryQuery.data?.project.title || "История"}</p>
          </div>
          <div className="forecast-header__status">
            <StatusPill label={readOnly ? "Только чтение" : "AI доступен"} tone={readOnly ? "warning" : "ready"} />
            <span>{latestForecast ? "прогноз сохранен" : "прогноза нет"}</span>
          </div>
        </header>

        {errors.map((error) => (
          <NoticeBlock key={error} tone="error">
            {error}
          </NoticeBlock>
        ))}
        {readOnly && <NoticeBlock>Прогноз доступен только для чтения, пока AI недоступен.</NoticeBlock>}
        {generateMutation.error instanceof Error && <NoticeBlock tone="error">{generateMutation.error.message}</NoticeBlock>}
        {selectMutation.error instanceof Error && <NoticeBlock tone="error">{selectMutation.error.message}</NoticeBlock>}

        <div className="forecast-layout">
          <aside className="forecast-side">
            <ProjectAgentSettingsCard
              agentKey="forecaster"
              className="forecast-panel"
              description="Применяется к генерации прогноза следующего движения истории."
              disabled={readOnly}
              projectId={projectId}
              title="Настройки прогноза"
            />

            <section className="forecast-panel forecast-controls">
              <div className="forecast-panel__title">
                <Compass size={18} aria-hidden="true" />
                <h2>Параметры</h2>
              </div>
              <label>
                Горизонт
                <select
                  disabled={readOnly}
                  name="forecast-horizon"
                  onChange={(event) => setHorizon(Number(event.target.value))}
                  value={horizon}
                >
                  <option value={1}>1 глава</option>
                  <option value={2}>2 главы</option>
                  <option value={3}>3 главы</option>
                </select>
              </label>
              <div className="forecast-lines">
                {storyLines.map((line) => (
                  <label key={line.id}>
                    <input
                      checked={selectedLineIds.includes(line.id)}
                      disabled={readOnly}
                      name="forecast-story-lines"
                      onChange={() => toggleLine(line.id)}
                      type="checkbox"
                      value={line.id}
                    />
                    <span>{line.title}</span>
                  </label>
                ))}
              </div>
              <button disabled={readOnly || generateMutation.isPending} onClick={generateForecast} type="button">
                <Sparkles size={15} aria-hidden="true" />
                {latestForecast ? "Сгенерировать новый прогноз" : "Сгенерировать прогноз"}
              </button>
              <Link to={`/projects/${projectId}/chapters/prepare`}>Подготовить следующую главу</Link>
            </section>
          </aside>

          <main className="forecast-main">
            {latestForecast ? (
              <ForecastPanel
                forecast={latestForecast}
                lineTitleById={lineTitleById}
                onSelect={(optionId) => selectMutation.mutate(optionId)}
                readOnly={readOnly || selectMutation.isPending}
              />
            ) : (
              <section className="forecast-panel forecast-empty">
                <GitBranch size={24} aria-hidden="true" />
                <h2>Прогноз еще не создан</h2>
                <p>Он покажет несколько мягких направлений и не фиксирует финал.</p>
              </section>
            )}
          </main>
        </div>
      </div>
    </AppShell>
  );
}

function ForecastPanel({
  forecast,
  lineTitleById,
  onSelect,
  readOnly,
}: {
  forecast: Forecast;
  lineTitleById: Map<string, string>;
  onSelect: (optionId: string) => void;
  readOnly: boolean;
}) {
  return (
    <section className="forecast-panel">
      <div className="forecast-panel__title">
        <GitBranch size={18} aria-hidden="true" />
        <h2>Варианты</h2>
      </div>
      {forecast.summary && <p>{forecast.summary}</p>}
      <div className="forecast-options">
        {forecast.options.map((option) => (
          <article className="forecast-option" key={option.id}>
            <div>
              <strong>{option.title}</strong>
              {option.is_selected_as_orientation && <StatusPill label="ориентир" tone="ready" />}
            </div>
            {option.description && <p>{option.description}</p>}
            <dl>
              <dt>Линии</dt>
              <dd>
                {option.related_story_line_ids.map((id) => lineTitleById.get(id) || id).join(", ") || "не указаны"}
              </dd>
              <dt>Последствия</dt>
              <dd>{option.likely_consequences.join("; ") || "мягко зависят от следующей главы"}</dd>
              <dt>Риски</dt>
              <dd>{option.risks.join("; ") || "явных рисков нет"}</dd>
            </dl>
            <button disabled={readOnly} onClick={() => onSelect(option.id)} type="button">
              Сохранить как ориентир
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
