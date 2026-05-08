import { useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronLeft, Compass, Layers3 } from "lucide-react";
import { Link } from "react-router-dom";

import { projectQueries } from "../../../entities/project";
import { AppShell } from "../../../widgets/app-shell";
import "./ProjectWorkspaceRoute.css";

type ProjectWorkspaceRouteProps = {
  projectId: string;
};

export function ProjectWorkspaceRoute({ projectId }: ProjectWorkspaceRouteProps) {
  const projectQuery = useQuery(projectQueries.detail(projectId));
  const error = projectQuery.error instanceof Error ? projectQuery.error.message : undefined;
  const project = projectQuery.data;
  const title = project?.title || "Проект";

  return (
    <AppShell>
      <div className="workspace-route">
        <header className="workspace-route__header">
          <div>
            <Link className="workspace-route__back" to="/projects">
              <ChevronLeft size={16} aria-hidden="true" />
              Проекты
            </Link>
            <h1>{title}</h1>
          </div>
        </header>

        {error && <div className="workspace-route__state is-error">{error}</div>}

        {projectQuery.isPending && <div className="workspace-route__state">Загрузка проекта</div>}

        {project && (
          <section className="workspace-overview" aria-label="Обзор проекта">
            <article className="workspace-overview__main">
              <div className="workspace-overview__title">
                <BookOpen size={18} aria-hidden="true" />
                <h2>Синопсис</h2>
              </div>
              <p>{project.synopsis || "Синопсис пока пуст."}</p>
            </article>

            <div className="workspace-overview__side">
              <article className="workspace-overview__tile">
                <Layers3 size={18} aria-hidden="true" />
                <div>
                  <span>Статус</span>
                  <strong>{project.status}</strong>
                </div>
              </article>
              <article className="workspace-overview__tile">
                <Compass size={18} aria-hidden="true" />
                <div>
                  <span>Следующий шаг</span>
                  <strong>Подготовить первую главу</strong>
                </div>
              </article>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
