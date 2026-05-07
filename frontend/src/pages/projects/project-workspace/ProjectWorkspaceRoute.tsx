import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
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
  const title = projectQuery.data?.name || "Проект";

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

        <section className="workspace-skeleton" aria-label="Каркас проекта" aria-busy={projectQuery.isPending}>
          <div className="workspace-skeleton__bar is-wide" />
          <div className="workspace-skeleton__grid">
            <div className="workspace-skeleton__block" />
            <div className="workspace-skeleton__block" />
          </div>
          <div className="workspace-skeleton__panel" />
        </section>
      </div>
    </AppShell>
  );
}
