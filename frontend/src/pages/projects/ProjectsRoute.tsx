import { useQuery } from "@tanstack/react-query";

import { projectQueries } from "../../entities/project";
import { runtimeQueries } from "../../entities/runtime";
import { NoticeBlock } from "../../shared/ui";
import { AppShell } from "../../widgets/app-shell";
import { ProjectList, ProjectsHeader } from "./ui";
import "./ProjectsRoute.css";

export function ProjectsRoute() {
  const projectsQuery = useQuery(projectQueries.list());
  const runtimeQuery = useQuery(runtimeQueries.status());
  const projects = projectsQuery.data || [];
  const error = projectsQuery.error instanceof Error ? projectsQuery.error.message : undefined;
  const readOnlyReason = runtimeQuery.data?.read_only ? runtimeQuery.data.reason : undefined;

  return (
    <AppShell>
      <div className="projects-route">
        <ProjectsHeader readOnly={Boolean(runtimeQuery.data?.read_only)} totalProjects={projects.length} />

        {readOnlyReason && <NoticeBlock>{readOnlyReason}</NoticeBlock>}

        {error && <NoticeBlock tone="error">{error}</NoticeBlock>}

        {projectsQuery.isPending && <NoticeBlock>Загрузка проектов</NoticeBlock>}

        {!projectsQuery.isPending && !error && projects.length === 0 && (
          <NoticeBlock>Проектов пока нет</NoticeBlock>
        )}

        {!projectsQuery.isPending && projects.length > 0 && <ProjectList projects={projects} />}
      </div>
    </AppShell>
  );
}
