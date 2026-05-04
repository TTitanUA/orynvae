import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { projectQueries } from "../../entities/project";
import { NoticeBlock } from "../../shared/ui";
import { AppShell } from "../../widgets/app-shell";
import { ProjectList, ProjectsHeader } from "./ui";
import "./ProjectsRoute.css";

export function ProjectsRoute() {
  const projectsQuery = useQuery(projectQueries.list());
  const projects = useMemo(() => projectsQuery.data || [], [projectsQuery.data]);
  const error = projectsQuery.error instanceof Error ? projectsQuery.error.message : undefined;

  const activeProjects = useMemo(
    () => projects.filter((project) => project.status === "active").length,
    [projects],
  );

  return (
    <AppShell>
      <div className="projects-route">
        <ProjectsHeader activeProjects={activeProjects} totalProjects={projects.length} />

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
