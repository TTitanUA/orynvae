import { useEffect, useMemo, useState } from "react";

import { fetchProjects } from "../api/projects";
import { NoticeBlock } from "../components/molecules/NoticeBlock";
import { ProjectList } from "../components/organisms/ProjectList";
import { ProjectsHeader } from "../components/organisms/ProjectsHeader";
import { AppShell } from "../components/templates/AppShell";
import { useShowHiddenItems } from "../privacySettings";
import type { Project } from "../types/projects";
import "./ProjectsRoute.css";

export function ProjectsRoute() {
  const [showHiddenItems] = useShowHiddenItems();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const activeProjects = useMemo(
    () => projects.filter((project) => project.status === "active").length,
    [projects],
  );

  useEffect(() => {
    let isCurrent = true;

    fetchProjects()
      .then((nextProjects) => {
        if (isCurrent) {
          setProjects(nextProjects);
          setError(undefined);
        }
      })
      .catch((reason) => {
        if (isCurrent) {
          setError(reason instanceof Error ? reason.message : "Не удалось загрузить проекты.");
        }
      })
      .finally(() => {
        if (isCurrent) {
          setLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [showHiddenItems]);

  return (
    <AppShell>
      <div className="projects-route">
        <ProjectsHeader activeProjects={activeProjects} totalProjects={projects.length} />

        {error && <NoticeBlock tone="error">{error}</NoticeBlock>}

        {loading && <NoticeBlock>Загрузка проектов</NoticeBlock>}

        {!loading && !error && projects.length === 0 && (
          <NoticeBlock>Проектов пока нет</NoticeBlock>
        )}

        {!loading && projects.length > 0 && <ProjectList projects={projects} />}
      </div>
    </AppShell>
  );
}
